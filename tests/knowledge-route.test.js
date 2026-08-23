const fs = require('node:fs/promises');
const path = require('node:path');

describe('global knowledge network wiring', () => {
  it('wires the hardened knowledge route and graph proxy', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', 'privacy-server.js'), 'utf8');

    expect(source).toContain("app.get('/api/knowledge'");
    expect(source).toContain("searchServiceTarget('/graph/all')");
    expect(source).toContain("app.get(['/knowledge', '/knowledge/']");
    expect(source).toContain("sendHardenedHtml(res, 'index.html')");
  });

  it('loads shared navigation from the fallback shell', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');

    expect(source).toContain('<script src="/assets/tag-navigation.js"></script>');
    expect(source).toContain('Kernel Notes');
  });

  it('uses the sanitized knowledge API and local ForceGraph asset', async () => {
    const source = await fs.readFile(
      path.join(__dirname, '..', 'assets', 'knowledge-network.js'),
      'utf8'
    );

    expect(source).toContain("fetch('/api/knowledge?limit=5'");
    expect(source).toContain("const FORCE_GRAPH_SRC = '/vendor/force-graph/force-graph.min.js'");
    expect(source).toContain('knowledge://kernel-notes/global');
  });
});
