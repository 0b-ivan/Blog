const request = require('supertest');
const privacy = require('../privacy-server');

describe('global knowledge network route', () => {
  it('serves /knowledge through the hardened fallback shell', async () => {
    const app = privacy.createApp();
    const response = await request(app).get('/knowledge');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.text).toContain('/assets/tag-navigation.js');
    expect(response.text).toContain('Kernel Notes');
  });

  it('serves the knowledge network browser asset', async () => {
    const app = privacy.createApp();
    const response = await request(app).get('/assets/knowledge-network.js');

    expect(response.status).toBe(200);
    expect(response.text).toContain('knowledge://kernel-notes/global');
    expect(response.text).toContain("/vendor/force-graph/force-graph.min.js");
  });
});
