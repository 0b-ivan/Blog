const fs = require('node:fs');
const path = require('node:path');

describe('release metadata', () => {
  const root = path.join(__dirname, '..');

  it('keeps VERSION semantic and exposes the production version without feature labels', () => {
    const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dockerfile).toContain('build-info.json');
    expect(index).not.toContain('info.name');
    expect(index).toContain('· ${version} · Letztes Release: ${release}');
  });
});
