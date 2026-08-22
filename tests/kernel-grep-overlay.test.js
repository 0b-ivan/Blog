const {
  addGrepNavigation,
  addKernelGrepAssets,
  hardenHtml
} = require('../privacy-server');

describe('Kernel Grep overlay injection', () => {
  const page = `<!doctype html>
<html lang="de">
  <head><title>Test</title></head>
  <body>
    <nav class="main-nav">
      <a href="/snippets/">Snippets</a>
      <a href="/grep">Grep</a>
    </nav>
    <main>Content</main>
  </body>
</html>`;

  it('adds one console trigger next to the Grep navigation entry', () => {
    const html = addGrepNavigation(page);
    expect(html.match(/data-kernel-grep-trigger/g)).toHaveLength(1);
    expect(html).toContain('class="kernel-grep-nav-trigger"');
    expect(html).toContain('<kbd>⌘K</kbd>');
    expect(html).toContain('<a href="/grep">Grep</a>');
  });

  it('injects overlay assets only once', () => {
    const once = addKernelGrepAssets(page);
    const twice = addKernelGrepAssets(once);

    expect(twice.match(/kernel-grep-overlay\.css/g)).toHaveLength(1);
    expect(twice.match(/kernel-grep-overlay\.js/g)).toHaveLength(1);
  });

  it('keeps the complete hardening transformation idempotent for Grep assets', () => {
    const once = hardenHtml(page);
    const twice = hardenHtml(once);

    expect(twice.match(/data-kernel-grep-trigger/g)).toHaveLength(1);
    expect(twice.match(/kernel-grep-overlay\.css/g)).toHaveLength(1);
    expect(twice.match(/kernel-grep-overlay\.js/g)).toHaveLength(1);
  });
});
