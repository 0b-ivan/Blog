const fs = require('node:fs');
const path = require('node:path');

describe('Obsidian LiveSync article assets', () => {
  const root = path.resolve(__dirname, '..');

  it('mounts repository article assets into the LiveSync vault', () => {
    const compose = fs.readFileSync(
      path.join(root, 'ops', 'obsidian-livesync', 'docker-compose.yml'),
      'utf8'
    );

    expect(compose).toContain(
      '${OBSIDIAN_ASSETS_PATH:-../../assets/posts}:/vault/assets/posts'
    );
  });

  it('deploys explicit vault and asset paths', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'deploy-obsidian-livesync.yml'),
      'utf8'
    );

    expect(workflow).toContain("printf 'OBSIDIAN_VAULT_PATH=../../posts\\n'");
    expect(workflow).toContain("printf 'OBSIDIAN_ASSETS_PATH=../../assets/posts\\n'");
  });

  it('always reconciles the headless client while preserving image recovery and asset verification', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'deploy-obsidian-livesync.yml'),
      'utf8'
    );

    expect(workflow).toContain("kernel-notes-livesync-cli");
    expect(workflow).not.toContain('if [ -n "$headless_exists" ]; then');
    expect(workflow).toContain('No reusable headless LiveSync image exists');
    expect(workflow).toContain('Headless LiveSync client is not running after reconciliation');
    expect(workflow).toContain(
      'docker tag "$headless_image_id" kernel-notes-obsidian-sync-livesync-cli:latest'
    );
    expect(workflow).toContain(
      'docker compose --env-file .env --profile headless up -d --force-recreate --no-build livesync-cli'
    );
    expect(workflow).toContain(
      'eq .Destination "/vault/assets/posts"'
    );
  });
});
