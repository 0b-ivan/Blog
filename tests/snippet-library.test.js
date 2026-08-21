const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { createApp, readPosts } = require('../server');

async function writePost(dir, fileName, title, publishedAt) {
  await fs.writeFile(
    path.join(dir, fileName),
    `---\ntitle: ${title}\ndate: 2026-08-21\npublished_at: ${publishedAt}\ncategory: Engineering\n---\nBody`,
    'utf-8'
  );
}

describe('snippet library and publish ordering', () => {
  it('sorts same-day posts by internal published_at without exposing it through the API', async () => {
    const previousTtl = process.env.POSTS_CACHE_TTL_MS;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-published-at-'));
    process.env.POSTS_CACHE_TTL_MS = '0';

    try {
      await writePost(tmpDir, '2026-08-21-older.md', 'Older', '2026-08-21T08:00:00Z');
      await writePost(tmpDir, '2026-08-21-newer.md', 'Newer', '2026-08-21T10:00:00Z');

      const posts = await readPosts(tmpDir);
      expect(posts.map((post) => post.title)).toEqual(['Newer', 'Older']);
      expect(posts[0].publishedAt).toBe('2026-08-21T10:00:00Z');

      const response = await request(createApp({ postsDir: tmpDir })).get('/api/posts');
      expect(response.status).toBe(200);
      expect(response.body.map((post) => post.title)).toEqual(['Newer', 'Older']);
      expect(response.body[0]).not.toHaveProperty('publishedAt');
      expect(response.body[0]).not.toHaveProperty('published_at');
    } finally {
      if (previousTtl === undefined) {
        delete process.env.POSTS_CACHE_TTL_MS;
      } else {
        process.env.POSTS_CACHE_TTL_MS = previousTtl;
      }
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves the snippet library and its manifest', async () => {
    const app = createApp();

    const page = await request(app).get('/snippets/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Code Snippets');

    const manifest = await request(app).get('/snippets/manifest.json');
    expect(manifest.status).toBe(200);
    expect(Array.isArray(manifest.body)).toBe(true);
    expect(manifest.body.length).toBeGreaterThan(0);
    expect(manifest.body[0]).toEqual(expect.objectContaining({
      title: expect.any(String),
      path: expect.any(String),
      language: expect.any(String)
    }));
  });
});
