const { URL } = require('node:url');
const {
  defaultQuery,
  downloadPhoto,
  fileExtension,
  parseArgs,
  searchPixabay
} = require('../scripts/resolve-pixabay-cover');

describe('Pixabay cover resolver', () => {
  it('derives a compact search query from article metadata', () => {
    expect(defaultQuery({
      title: 'Chaos Monkey gegen meinen Blog',
      category: 'DevOps',
      tags: ['Kubernetes', 'Chaos Engineering', 'K3s', 'Cloudflare']
    })).toContain('Chaos Monkey gegen meinen Blog');
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
