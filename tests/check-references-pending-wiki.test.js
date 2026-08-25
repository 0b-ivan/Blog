const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('reference checker pending wiki links', () => {
  it('keeps unresolved wiki-links as warnings instead of hard errors', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-check-'));
    const posts = path.join(root, 'posts');
    const scripts = path.join(root, 'scripts');

    try {
      await fs.mkdir(posts, { recursive: true });
      await fs.mkdir(scripts, { recursive: true });
      await fs.writeFile(path.join(posts, '_sources.json'), '{}\n', 'utf8');
      await fs.writeFile(
        path.join(posts, '2026-08-25-test.md'),
        '---\ntitle: Test\n---\n\nSiehe [[Noch Nicht Da]].\n',
        'utf8'
      );

      const source = await fs.readFile(
        path.join(__dirname, '..', 'scripts', 'check-references.js'),
        'utf8'
      );
      await fs.writeFile(path.join(scripts, 'check-references.js'), source, 'utf8');

      const result = spawnSync(process.execPath, [path.join(scripts, 'check-references.js')], {
        cwd: root,
        encoding: 'utf8'
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("wiki-link target currently not published 'Noch Nicht Da'");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
