const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const {
  PIXABAY_CACHE_TTL_MS,
  choosePhoto,
  defaultQuery,
  downloadPhoto,
  fileExtension,
  parseArgs,
  queryCandidates,
  rankHits,
  renderCandidates,
  scoreHit,
  searchPixabay,
  searchPixabayCached
} = require('../scripts/resolve-pixabay-cover');

describe('Pixabay cover resolver', () => {
  it('derives a compact search query from article metadata', () => {
    expect(defaultQuery({
      title: 'Chaos Monkey gegen meinen Blog',
      category: 'DevOps',
      tags: ['Kubernetes', 'Chaos Engineering', 'K3s', 'Cloudflare']
    })).toContain('kubernetes');
    expect(defaultQuery({ title: 'Test', tags: [] }).length).toBeLessThanOrEqual(100);
  });

  it('parses resolver CLI arguments', () => {
    expect(parseArgs([
      'posts/test.md',
      '--query',
      'kubernetes datacenter',
      '--select',
      '2'
    ])).toEqual({
      target: 'posts/test.md',
      query: 'kubernetes datacenter',
      select: 2,
      preview: false
    });

    expect(parseArgs(['posts/test.md', '--preview'])).toMatchObject({
      target: 'posts/test.md',
      preview: true
    });
  });

  it('calls Pixabay search with safe landscape photo filters', async () => {
    const fetchImpl = globalThis.vi.fn(async (url) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://pixabay.com');
      expect(parsed.searchParams.get('q')).toBe('kubernetes datacenter');
      expect(parsed.searchParams.get('image_type')).toBe('photo');
      expect(parsed.searchParams.get('orientation')).toBe('horizontal');
      expect(parsed.searchParams.get('safesearch')).toBe('true');
      expect(parsed.searchParams.get('key')).toBe('test-key');
      expect(parsed.searchParams.get('per_page')).toBe('12');
      return {
        ok: true,
        json: async () => ({
          hits: [{ id: 42, pageURL: 'https://pixabay.com/photos/example-42/' }]
        })
      };
    });

    const hits = await searchPixabay('kubernetes datacenter', 'test-key', fetchImpl);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(42);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses focused fallback queries when an article query returns no result', () => {
    const queries = queryCandidates({
      title: 'Ein deutscher Titel',
      category: 'DevOps',
      tags: ['Kubernetes', 'Cloudflare']
    }, 'specific query');

    expect(queries[0]).toBe('specific query');
    expect(queries[1]).toContain('kubernetes');
    expect(queries[1]).toContain('server');
    expect(queries[2]).toBe('Ein deutscher Titel');
  });

  it('ranks technically relevant landscape images above generic stock photos', () => {
    const data = {
      title: 'Warum ich Immich nicht synchronisiere',
      category: 'Self-Hosting',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone']
    };

    const ranked = rankHits([
      {
        id: 1,
        tags: 'business, people, meeting, office',
        imageWidth: 1920,
        imageHeight: 1080,
        likes: 500,
        downloads: 20000
      },
      {
        id: 2,
        tags: 'photo, storage, cloud, server, files',
        imageWidth: 2400,
        imageHeight: 1350,
        likes: 30,
        downloads: 1000
      }
    ], data);

    expect(ranked[0].hit.id).toBe(2);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].matched).toEqual(expect.arrayContaining(['photo', 'storage', 'cloud', 'server']));
    expect(ranked[1].avoided).toEqual(expect.arrayContaining(['people', 'meeting']));
  });

  it('supports article-specific cover_avoid terms', () => {
    const result = scoreHit({
      tags: 'server, neon, network',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      positive: ['server', 'network'],
      avoid: ['neon']
    });

    expect(result.matched).toEqual(expect.arrayContaining(['server', 'network']));
    expect(result.avoided).toEqual(['neon']);
  });

  it('renders scored candidate previews as markdown images', () => {
    const markdown = renderCandidates([{
      hit: {
        id: 42,
        user: 'Example',
        tags: 'server, cloud',
        pageURL: 'https://pixabay.com/photos/example-42/',
        webformatURL: 'https://cdn.example.test/example_640.jpg',
        __coverQuery: 'server cloud'
      },
      score: 78,
      matched: ['server', 'cloud'],
      avoided: []
    }]);

    expect(markdown).toContain('78/100');
    expect(markdown).toContain('sehr passend');
    expect(markdown).toContain('![Pixabay Kandidat 1](https://cdn.example.test/example_640.jpg)');
    expect(markdown).toContain('Themen-Matches: server, cloud');
  });

  it('caches Pixabay API responses for 24 hours without storing the API key', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixabay-cache-'));
    const fetchImpl = globalThis.vi.fn(async () => ({
      ok: true,
      json: async () => ({ hits: [{ id: 42, pageURL: 'https://pixabay.com/photos/example-42/' }] })
    }));

    try {
      const first = await searchPixabayCached('kubernetes', 'super-secret', {
        cacheDir,
        fetchImpl,
        now: 1_000
      });
      const second = await searchPixabayCached('kubernetes', 'super-secret', {
        cacheDir,
        fetchImpl,
        now: 1_000 + PIXABAY_CACHE_TTL_MS - 1
      });

      expect(first).toEqual(second);
      expect(fetchImpl).toHaveBeenCalledOnce();

      const files = await fs.readdir(cacheDir);
      const cached = await fs.readFile(path.join(cacheDir, files[0]), 'utf8');
      expect(cached).not.toContain('super-secret');
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('rejects a selected candidate that Pixabay did not return', async () => {
    await expect(choosePhoto([{ id: 1 }], 2)).rejects.toThrow(
      'Selected Pixabay candidate 2 is unavailable'
    );
  });

  it('downloads the selected image without exposing the API key', async () => {
    const bytes = Buffer.from('image-bytes');
    const fetchImpl = globalThis.vi.fn(async (url) => {
      expect(url).toBe('https://cdn.example.test/large.jpg');
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => bytes
      };
    });

    const result = await downloadPhoto({
      largeImageURL: 'https://cdn.example.test/large.jpg'
    }, fetchImpl);

    expect(result.buffer.equals(bytes)).toBe(true);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('selects a stable local extension from image metadata', () => {
    expect(fileExtension('https://cdn.test/photo.png', 'image/png')).toBe('png');
    expect(fileExtension('https://cdn.test/photo.webp', 'image/webp')).toBe('webp');
    expect(fileExtension('https://cdn.test/photo_1280.jpg', 'image/jpeg')).toBe('jpg');
  });
});
