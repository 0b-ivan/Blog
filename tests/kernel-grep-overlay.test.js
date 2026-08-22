const fs = require('node:fs');
const path = require('node:path');

describe('Kernel Grep overlay contract', () => {
  const privacyServerSource = fs.readFileSync(path.join(__dirname, '..', 'privacy-server.js'), 'utf8');
  const overlaySource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'kernel-grep-overlay.js'), 'utf8');

  it('injects a navigation console trigger and local overlay assets', () => {
    expect(privacyServerSource).toContain('data-kernel-grep-trigger');
    expect(privacyServerSource).toContain('class="kernel-grep-nav-trigger"');
    expect(privacyServerSource).toContain('/assets/css/kernel-grep-overlay.css');
    expect(privacyServerSource).toContain('/assets/kernel-grep-overlay.js');
    expect(privacyServerSource).toContain('function addKernelGrepAssets(html)');
  });

  it('keeps the overlay on the local POST search path', () => {
    expect(overlaySource).toContain("fetch('/api/search'");
    expect(overlaySource).toContain("method: 'POST'");
    expect(overlaySource).toContain('AbortController');
    expect(overlaySource).toContain('DEBOUNCE_MS = 180');
  });

  it('supports Spotlight and console interaction shortcuts', () => {
    expect(overlaySource).toContain("event.key.toLowerCase() === 'k'");
    expect(overlaySource).toContain("event.key === '/'");
    expect(overlaySource).toContain("event.key === 'Escape'");
    expect(overlaySource).toContain('grep --semantic');
  });
});
