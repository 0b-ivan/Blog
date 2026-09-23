const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildColophon,
  buildCoverSvg,
  buildPhotoCoverSvg,
  createEpubCover,
  displayAuthor,
  ensureCoverImageProperty,
  normalizeEpubDate,
  prepareChapterHtml,
  wrapCoverTitle
} = require('../lib/ebook-export');

describe('article ebook export helpers', () => {
  it('normalizes YAML Date objects for EPUB metadata validation', () => {
    expect(normalizeEpubDate(new Date('2026-09-20T00:00:00.000Z'))).toBe('2026-09-20');
    expect(normalizeEpubDate('2026-09-21')).toBe('2026-09-21');
    expect(normalizeEpubDate(undefined)).toBeUndefined();
  });

  it('maps the blog handle to the public author name', () => {
    expect(displayAuthor('obivan')).toBe('Ivan Babayev');
    expect(displayAuthor('0b-ivan')).toBe('Ivan Babayev');
    expect(displayAuthor('Guest Author')).toBe('Guest Author');
  });

  it('normalizes YAML Date objects to the string format expected by epub-gen-memory', () => {
    expect(normalizeEpubDate(new Date('2026-09-20T00:00:00.000Z'))).toBe('2026-09-20');
    expect(normalizeEpubDate('2026-09-20')).toBe('2026-09-20');
  });

  it('wraps long titles for a book cover', () => {
    const lines = wrapCoverTitle(
      'Chaos Monkey gegen meinen eigenen Blog mit Kubernetes und GitOps',
      22,
      6
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(6);
  });

  it('creates a generated Kernel Notes cover when no photo exists', () => {
    const svg = buildCoverSvg({
      title: 'Kubernetes ohne Magie',
      author: 'obivan',
      category: 'DevOps',
      date: '2026-09-22'
    });

    expect(svg).toContain('KERNEL NOTES');
    expect(svg).toContain('Kubernetes ohne');
    expect(svg).toContain('Ivan Babayev');
    expect(svg).toContain('DIGITAL EDITION');
  });

  it('keeps the colophon focused on publication metadata', () => {
    const html = buildColophon({
      slug: 'pixabay-test',
      title: 'Pixabay Test',
      author: 'obivan',
      category: 'DevOps',
      date: '2026-09-23',
      coverCredit: 'by Example via Pixabay',
      coverSourceUrl: 'https://pixabay.com/photos/example-42/',
      coverLicense: 'Pixabay Content License',
      coverLicenseUrl: 'https://pixabay.com/service/license-summary/'
    }, 'https://blog.obivan.org');

    expect(html).toContain('Pixabay Test');
    expect(html).toContain('Ivan Babayev');
    expect(html).not.toContain('by Example via Pixabay');
    expect(html).not.toContain('Pixabay Content License');
  });

  it('keeps the photo-backed deckblatt free of decorative monkey artwork', () => {
    const svg = buildPhotoCoverSvg({
      slug: 'chaos-engineering-chaos-monkey-kubernetes',
      title: 'Chaos Monkey ist kein Zufall',
      author: 'obivan',
      category: 'DevOps',
      tags: ['Chaos-Engineering', 'Kubernetes'],
      date: '2026-09-22',
      coverCredit: 'Image by Example from Pixabay'
    }, 'data:image/jpeg;base64,ZmFrZQ==');

    expect(svg).toContain('data:image/jpeg;base64,ZmFrZQ==');
    expect(svg).toContain('Chaos Monkey ist kein');
    expect(svg).not.toContain('Image by Example from Pixabay');
    expect(svg).toContain('Ivan Babayev');
    expect(svg).toContain('Courier New');
    expect(svg).not.toContain('cover-monkey');
  });

  it('uses the existing raster article image as the pragmatic EPUB library cover', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), image);

      const cover = await createEpubCover({
        slug: 'demo',
        title: 'Demo',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot);

      expect(cover.name).toBe('demo-cover.jpg');
      expect(cover.type).toBe('image/jpeg');
      expect(Buffer.from(await cover.arrayBuffer())).toEqual(image);
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('marks the manifest image as the EPUB 3 cover image without dropping other properties', () => {
    const opf = '<manifest><item id="image_cover" href="cover.svg" media-type="image/svg+xml" properties="svg" /></manifest>';
    const patched = ensureCoverImageProperty(opf);

    expect(patched).toContain('properties="svg cover-image"');
    expect(ensureCoverImageProperty(patched)).toBe(patched);
  });

  it('rewrites local article assets to file URLs for offline EPUB embedding', () => {
    const html = prepareChapterHtml(
      '<p><img src="/assets/posts/demo/image.svg" /></p><a href="/posts/next">Next</a>',
      {
        siteUrl: 'https://blog.obivan.org',
        assetRoot: path.resolve('/tmp/blog')
      }
    );

    expect(html).toContain('file:///tmp/blog/assets/posts/demo/image.svg');
    expect(html).toContain('https://blog.obivan.org/posts/next');
  });
});
