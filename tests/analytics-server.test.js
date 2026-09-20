const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

describe('analytics service', () => {
  let tmpDir;
  let analytics;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-analytics-'));
    process.env.ANALYTICS_DATA_DIR = tmpDir;
    delete require.cache[require.resolve('../analytics-server')];
    analytics = require('../analytics-server');
  });

  afterAll(async () => {
    delete process.env.ANALYTICS_DATA_DIR;
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('sanitizes slugs and search phrases', () => {
    expect(analytics.safeSlug('2026-09-20-test-post')).toBe('2026-09-20-test-post');
    expect(analytics.safeSlug('../secret')).toBe('');
    expect(analytics.safeQuery('  Docker   Compose  ')).toBe('Docker Compose');
  });

  it('records article engagement and exposes aggregate metrics', async () => {
    const server = analytics.createServer();

    await request(server).post('/event').send({
      type: 'article_view',
      slug: '2026-09-20-test-post'
    }).expect(202);

    await request(server).post('/event').send({
      type: 'article_active',
      slug: '2026-09-20-test-post',
      seconds: 30
    }).expect(202);

    await request(server).post('/event').send({
      type: 'article_scroll',
      slug: '2026-09-20-test-post',
      percent: 90,
      completed: true
    }).expect(202);

    await request(server).post('/like/2026-09-20-test-post').send({}).expect(200);

    const response = await request(server).get('/article/2026-09-20-test-post').expect(200);
    expect(response.body).toEqual({
      views: 1,
      averageActiveSeconds: 30,
      completionRate: 100,
      likes: 1
    });
  });

  it('records only explicit reader searches and reports content gaps', async () => {
    const server = analytics.createServer();

    await request(server).post('/event').send({
      type: 'search',
      query: '  Meshtastic   MQTT ',
      resultCount: 0,
      source: 'grep-page'
    }).expect(202);

    await request(server).post('/event').send({
      type: 'search_click',
      query: 'Meshtastic MQTT',
      slug: 'example',
      rank: 1,
      source: 'grep-page'
    }).expect(202);

    await request(server).post('/event').send({
      type: 'search',
      query: 'automatic graph query',
      resultCount: 4,
      source: 'system'
    }).expect(400);

    const response = await request(server).get('/summary?days=30').expect(200);
    expect(response.body.totals.searches).toBe(1);
    expect(response.body.totals.searchCtr).toBe(100);
    expect(response.body.totals.zeroResultRate).toBe(100);
    expect(response.body.topSearches[0]).toMatchObject({
      query: 'Meshtastic MQTT',
      searches: 1,
      clicks: 1,
      zeroResults: 1
    });
    expect(response.body.contentGaps[0].query).toBe('Meshtastic MQTT');
  });

  it('rejects malformed article events', async () => {
    const server = analytics.createServer();
    await request(server).post('/event').send({
      type: 'article_view',
      slug: '../secret'
    }).expect(400);
  });
});
