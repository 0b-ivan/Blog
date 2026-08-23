const request = require('supertest');
const privacy = require('../privacy-server');

describe('global knowledge network route', () => {
  it('serves /knowledge through the hardened shell', async () => {
    const app = privacy.createApp();
    const response = await request(app).get('/knowledge');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.text).toContain('/assets/tag-navigation.js');
    expect(response.text).toContain('data-kernel-grep-trigger');
    expect(response.text).toContain('Kernel Notes');
  });

  it('serves the knowledge network browser asset', async () => {
    const app = privacy.createApp();
    const response = await request(app).get('/assets/knowledge-network.js');

    expect(response.status).toBe(200);
    expect(response.text).toContain('knowledge://kernel-notes/global');
    expect(response.text).toContain('/api/knowledge?limit=5');
    expect(response.text).toContain('/vendor/force-graph/force-graph.min.js');
  });

  it('normalizes graph limits and targets the internal graph endpoint', () => {
    expect(privacy.normalizedGraphLimit(undefined)).toBe(4);
    expect(privacy.normalizedGraphLimit(99)).toBe(8);
    expect(privacy.normalizedGraphLimit(-2)).toBe(1);

    const target = privacy.searchServiceTarget('/graph/all');
    expect(target.pathname).toBe('/graph/all');
    expect(target.search).toBe('');
  });
});
