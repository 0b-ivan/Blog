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

  it('recreates an already-running headless client after stack changes', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'deploy-obsidian-livesync.yml'),
      'utf8'
    );

    expect(workflow).toContain("kernel-notes-livesync-cli");
    expect(workflow).toContain(
      'docker compose --env-file .env --profile headless up -d --force-recreate livesync-cli'
    );
  });
});
