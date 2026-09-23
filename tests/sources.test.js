const request = require('supertest');
const { createApp } = require('../server');

describe('central sources', () => {
  it('serves the source directory', async () => {
    const res = await request(createApp()).get('/sources.html');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Quellen</h1>');
    expect(res.text).toContain('id="sources-list"');
    expect(res.text).toContain('/assets/sources.js');
  });

  it('exposes the central source catalog as json', async () => {
    const res = await request(createApp()).get('/posts/_sources.json');

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(res.body['docker-compose']).toMatchObject({
      publisher: 'Docker Docs',
      url: 'https://docs.docker.com/reference/compose-file/'
    });
    expect(res.body['github-dependabot-alerts']).toBeDefined();
  });

  it('merges article cover attribution into the central source catalog', async () => {
    const res = await request(createApp()).get('/api/sources');

    expect(res.status).toBe(200);
    expect(res.body['cover-2026-09-20-chaos-engineering-chaos-monkey-kubernetes']).toMatchObject({
      publisher: 'Pixabay',
      credit: 'by ColossusCloud via Pixabay',
      url: 'https://pixabay.com/photos/server-cloud-development-business-1235959/',
      license: 'Pixabay Content License',
      license_url: 'https://pixabay.com/service/license-summary/'
    });
  });
});
