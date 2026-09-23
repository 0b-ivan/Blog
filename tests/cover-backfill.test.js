const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  isPublished,
  isPublishedWithoutCover,
  listMissingCoverPosts,
  parseArgs
} = require('../scripts/list-missing-cover-posts');

describe('missing article covers', () => {
  it('treats publish and legacy posts without status as backfill candidates', () => {
    expect(isPublishedWithoutCover('---\nstatus: publish\ntitle: Test\n---\nBody')).toBe(true);
    expect(isPublishedWithoutCover('---\ntitle: Legacy\n---\nBody')).toBe(true);
  });

  it('skips drafts, archived posts and posts that already have a cover', () => {
    expect(isPublishedWithoutCover('---\nstatus: draft\ntitle: Draft\n---\nBody')).toBe(false);
    expect(isPublishedWithoutCover('---\nstatus: archived\ntitle: Old\n---\nBody')).toBe(false);
    expect(isPublishedWithoutCover('---\nstatus: publish\ncover_image: /assets/covers/test.jpg\n---\nBody')).toBe(false);
  });

  it('validates the batch limit', () => {
    expect(parseArgs([])).toEqual({ limit: 4, includeExisting: false });
    expect(parseArgs(['--limit', '12'])).toEqual({ limit: 12, includeExisting: false });
    expect(parseArgs(['--limit', '20', '--include-existing'])).toEqual({ limit: 20, includeExisting: true });
    expect(() => parseArgs(['--limit', '0'])).toThrow();
    expect(() => parseArgs(['--limit', '21'])).toThrow();
  });

  it('can include already-covered published posts for editorial re-ranking', async () => {
    const postsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-review-'));

    try {
      await fs.writeFile(path.join(postsDir, '2026-01-01-covered.md'), '---\nstatus: publish\ncover_image: /assets/covers/x.jpg\n---\nCovered');
      await fs.writeFile(path.join(postsDir, '2026-02-01-draft.md'), '---\nstatus: draft\ncover_image: /assets/covers/draft.jpg\n---\nDraft');

      expect(isPublished('---\nstatus: publish\n---\nBody')).toBe(true);
      expect(isPublished('---\nstatus: draft\n---\nBody')).toBe(false);

      const result = await listMissingCoverPosts({ postsDir, limit: 20, includeExisting: true });
      expect(result).toEqual(['posts/2026-01-01-covered.md']);
    } finally {
      await fs.rm(postsDir, { recursive: true, force: true });
    }
  });

  it('returns newest missing published posts first and honors the limit', async () => {
    const postsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-backfill-'));

    try {
      await fs.writeFile(path.join(postsDir, '2026-01-01-old.md'), '---\nstatus: publish\n---\nOld');
      await fs.writeFile(path.join(postsDir, '2026-03-01-new.md'), '---\nstatus: publish\n---\nNew');
      await fs.writeFile(path.join(postsDir, '2026-02-01-covered.md'), '---\nstatus: publish\ncover_image: /assets/covers/x.jpg\n---\nCovered');
      await fs.writeFile(path.join(postsDir, '2026-04-01-draft.md'), '---\nstatus: draft\n---\nDraft');

      const result = await listMissingCoverPosts({ postsDir, limit: 1 });
      expect(result).toEqual(['posts/2026-03-01-new.md']);
    } finally {
      await fs.rm(postsDir, { recursive: true, force: true });
    }
  });
});
