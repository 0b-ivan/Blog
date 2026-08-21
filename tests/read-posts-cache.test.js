/* global vi */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { readPosts } = require('../server');

async function writePost(dir, title) {
  await fs.writeFile(
    path.join(dir, 'cache-test.md'),
    `---\ntitle: ${title}\ndate: 2026-08-21\ncategory: Engineering\n---\nBody`,
    'utf-8'
  );
}

describe('readPosts cache', () => {
  it('serves the cached render until the TTL expires and then refreshes', async () => {
    const previousTtl = process.env.POSTS_CACHE_TTL_MS;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-cache-'));
    const nowSpy = vi.spyOn(Date, 'now');
    let now = 1_000_000;

    process.env.POSTS_CACHE_TTL_MS = '1000';
    nowSpy.mockImplementation(() => now);

    try {
      await writePost(tmpDir, 'First');
      const first = await readPosts(tmpDir);

      await writePost(tmpDir, 'Second');
      const cached = await readPosts(tmpDir);

      expect(cached).toBe(first);
      expect(cached[0].title).toBe('First');

      now += 1001;

      const refreshed = await readPosts(tmpDir);
      expect(refreshed).not.toBe(first);
      expect(refreshed[0].title).toBe('Second');
    } finally {
      nowSpy.mockRestore();

      if (previousTtl === undefined) {
        delete process.env.POSTS_CACHE_TTL_MS;
      } else {
        process.env.POSTS_CACHE_TTL_MS = previousTtl;
      }

      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('can disable the cache with POSTS_CACHE_TTL_MS=0', async () => {
    const previousTtl = process.env.POSTS_CACHE_TTL_MS;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-cache-off-'));

    process.env.POSTS_CACHE_TTL_MS = '0';

    try {
      await writePost(tmpDir, 'First');
      const first = await readPosts(tmpDir);

      await writePost(tmpDir, 'Second');
      const second = await readPosts(tmpDir);

      expect(second).not.toBe(first);
      expect(second[0].title).toBe('Second');
    } finally {
      if (previousTtl === undefined) {
        delete process.env.POSTS_CACHE_TTL_MS;
      } else {
        process.env.POSTS_CACHE_TTL_MS = previousTtl;
      }

      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
