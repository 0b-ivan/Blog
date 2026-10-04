const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-obsidian-livesync.yml'), 'utf8');
const start = workflow.indexOf('          # Reconcile even when');
const end = workflow.indexOf('          if [ "$DEPLOY_CLOUDFLARED"', start);
const script = 'set -euo pipefail\n' + workflow.slice(start, end).split('\n').map(line => line.slice(10)).join('\n');

function reconcile({ container = false, image = false, runtimeFailure = false, mount = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-livesync-'));
  try {
    const log = path.join(directory, 'calls');
    fs.writeFileSync(path.join(directory, 'docker'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  "inspect -f {{.Image}} kernel-notes-livesync-cli")
    [ "$HAS_CONTAINER" = true ] || exit 1
    echo sha256:existing ;;
  "image inspect sha256:existing") exit 0 ;;
  "tag "*) touch "$IMAGE_MARKER" ;;
  "image inspect kernel-notes-obsidian-sync-livesync-cli:latest")
    [ "$HAS_IMAGE" = true ] || [ -f "$IMAGE_MARKER" ] ;;
  "compose --env-file .env --profile headless build livesync-cli") touch "$IMAGE_MARKER" ;;
  "compose --env-file .env --profile headless up "*) [ "$RUNTIME_FAILURE" = false ] ;;
  "inspect -f {{.State.Running}} kernel-notes-livesync-cli") echo true ;;
  "inspect -f {{range .Mounts}}"*) [ "$HAS_MOUNT" = false ] || echo /assets/posts ;;
esac
`, { mode: 0o755 });
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, CALL_LOG: log,
      IMAGE_MARKER: path.join(directory, 'image'), HAS_CONTAINER: String(container),
      HAS_IMAGE: String(image), RUNTIME_FAILURE: String(runtimeFailure), HAS_MOUNT: String(mount)
    } });
    return { status: result.status, calls: fs.readFileSync(log, 'utf8'), output: result.stdout + result.stderr };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('headless LiveSync reconciliation', () => {
  it('recovers the tag from an existing container without rebuilding', () => {
    const result = reconcile({ container: true });
    expect(result.status).toBe(0);
    expect(result.calls).toContain('tag sha256:existing');
    expect(result.calls).not.toContain('headless build livesync-cli');
  });

  it('recreates a missing container from the cached image', () => {
    const result = reconcile({ image: true });
    expect(result.status).toBe(0);
    expect(result.calls).toContain('up -d --force-recreate --no-build livesync-cli');
    expect(result.calls).not.toContain('headless build livesync-cli');
  });

  it('builds only when no reusable image exists', () => {
    const result = reconcile();
    expect(result.status).toBe(0);
    expect(result.calls).toContain('headless build livesync-cli');
  });

  it('fails a runtime error without starting an upstream rebuild', () => {
    const result = reconcile({ image: true, runtimeFailure: true });
    expect(result.status).not.toBe(0);
    expect(result.calls).not.toContain('headless build livesync-cli');
  });

  it('rejects a running bridge without the article asset mount', () => {
    const result = reconcile({ image: true, mount: false });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('without /vault/assets/posts mount');
  });
});
