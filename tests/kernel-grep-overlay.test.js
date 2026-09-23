const fs = require('node:fs');
const path = require('node:path');

describe('Kernel Grep overlay contract', () => {
  const privacyServerSource = fs.readFileSync(path.join(__dirname, '..', 'privacy-server.js'), 'utf8');
  const overlaySource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'kernel-grep-overlay.js'), 'utf8');
  const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'kernel-grep-overlay.css'), 'utf8');

  it('injects a compact search icon at the end of the main navigation', () => {
    expect(privacyServerSource).toContain('data-kernel-grep-trigger');
    expect(privacyServerSource).toContain('class="kernel-grep-nav-trigger"');
    expect(privacyServerSource).toContain('aria-label="Kernel Grep öffnen"');
    expect(privacyServerSource).toContain('<svg viewBox="0 0 24 24"');
    expect(privacyServerSource).not.toContain('<span>grep…</span>');
    expect(privacyServerSource).not.toContain('<kbd>⌘K</kbd>');
    expect(privacyServerSource).toContain(".replace(/\\s*<a\\b[^>]*href=\"\\/grep\\/?\"");
    expect(privacyServerSource).toContain('`${openingTag}${content}\\n        ${GREP_TRIGGER}\\n      ${closingTag}`');
    expect(overlayCss).toContain('stroke: currentColor;');
    expect(privacyServerSource).toContain('/assets/css/kernel-grep-overlay.css');
    expect(privacyServerSource).toContain('/assets/kernel-grep-overlay.js');
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
