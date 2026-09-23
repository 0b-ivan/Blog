const fs = require('node:fs');
const path = require('node:path');

describe('release metadata', () => {
  const root = path.join(__dirname, '..');

  it('keeps VERSION semantic and exposes a human-readable release name', () => {
    const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    const releaseName = fs.readFileSync(path.join(root, 'RELEASE_NAME'), 'utf8').trim();
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(releaseName.length).toBeGreaterThan(0);
    expect(dockerfile).toContain('VERSION RELEASE_NAME');
    expect(dockerfile).toContain('"name":"%s"');
    expect(index).toContain('info.name');
  });
});
