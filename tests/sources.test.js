const request = require('supertest');
const { createApp } = require('../privacy-server');

describe('central sources', () => {
  it('serves the source directory through the hardened app', async () => {
    const res = await request(createApp()).get('/sources.html');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Quellen</h1>');
    expect(res.text).toContain('id="sources-list"');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('exposes the central source catalog as json', async () => {
    const res = await request(createApp()).get('/posts/_sources.json');

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(res.body['docker-compose']).toMatchObject({
      publisher: 'Docker Docs',
      url: 'https://docs.docker.com/compose/compose-file/'
    });
    expect(res.body['github-dependabot-alerts']).toBeDefined();
  });
});
