const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildColophon,
  buildCoverSvg,
  buildEditorialCoverSvg,
  buildPhotoCoverSvg,
  createDeckblatt,
  createEpubCover,
  displayAuthor,
  ensureCoverImageProperty,
  ensureDeckblattFixedLayout,
  ensureDeckblattItemrefProperties,
  hasEditorialCoverMetadata,
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

  it('uses editorial cover metadata only when a post opts in', () => {
    expect(hasEditorialCoverMetadata({
      title: 'Long title'
    })).toBe(false);
    expect(hasEditorialCoverMetadata({
      title: 'Long title',
      coverTitle: 'Short title'
    })).toBe(true);

    const svg = buildEditorialCoverSvg({
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      coverTitle: 'Chaos Engineering systematisch testen',
      coverSubtitle: 'Warum Chaos Monkey kein Zufall ist',
      author: 'obivan',
      category: 'DevOps',
      tags: ['Chaos-Engineering', 'Kubernetes'],
      date: '2026-09-20'
    }, 'data:image/jpeg;base64,ZmFrZQ==');

    expect(svg).toContain('Chaos Engineering');
    expect(svg).toContain('systematisch testen');
    expect(svg).toContain('Warum Chaos Monkey kein Zufall ist');
    expect(svg).toContain('data:image/jpeg;base64,ZmFrZQ==');
    expect(svg).not.toContain('Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen');
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

  it('uses the portrait editorial artwork as the EPUB library cover for editorial posts', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-editorial-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const cover = await createEpubCover({
        slug: 'demo',
        title: 'A very long article title',
        coverTitle: 'Short cover title',
        coverSubtitle: 'Readable subtitle',
        author: 'obivan',
        category: 'DevOps',
        date: '2026-09-24',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot);

      expect(cover.name).toBe('demo-cover.svg');
      expect(cover.type).toBe('image/svg+xml');
      const content = Buffer.from(await cover.arrayBuffer()).toString('utf8');
      expect(content).toContain('Short cover title');
      expect(content).toContain('Readable subtitle');
      expect(content).toContain('data:image/jpeg;base64,');
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('uses a full-page editorial deckblatt only for opted-in posts', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-editorial-deckblatt-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const deckblatt = await createDeckblatt({
        slug: 'demo',
        title: 'Long article title',
        coverTitle: 'Short cover title',
        coverSubtitle: 'Readable subtitle',
        author: 'obivan',
        category: 'DevOps',
        date: '2026-09-24',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot, 'https://blog.obivan.org');

      expect(deckblatt.html).toContain('book-deckblatt--editorial');
      expect(deckblatt.html).toContain('<img src="file://');
      expect(deckblatt.html).toContain('alt="Deckblatt: Short cover title"');
      expect(deckblatt.html).not.toContain('<svg');
      await deckblatt.cleanup();
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
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

  it('keeps the deckblatt spine item reflow-safe for Apple Books', () => {
    const opf = '<package><manifest><item id="deckblatt" href="deckblatt.xhtml" media-type="application/xhtml+xml" /><item id="article" href="article.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="deckblatt" properties="rendition:layout-pre-paginated rendition:spread-none" /><itemref idref="article" /></spine></package>';
    const patched = ensureDeckblattItemrefProperties(opf);

    expect(patched).toContain('<itemref idref="deckblatt" />');
    expect(patched).not.toContain('rendition:layout-pre-paginated');
    expect(patched).not.toContain('rendition:spread-none');
    expect(patched).toContain('<itemref idref="article" />');
  });

  it('keeps the deckblatt on one responsive viewport without fixed pixel dimensions', () => {
    const xhtml = '<html><head><title>Deckblatt</title></head><body><div class="book-deckblatt"><img src="cover.svg" /></div></body></html>';
    const patched = ensureDeckblattFixedLayout(xhtml);

    expect(patched).toContain('width=device-width, initial-scale=1.0');
    expect(patched).toContain('margin: 0 !important');
    expect(patched).toContain('height: 100vh !important');
    expect(patched).toContain('max-height: 100vh !important');
    expect(patched).toContain('object-fit: contain !important');
    expect(patched).not.toContain('width: 1600px !important');
    expect(patched).not.toContain('height: 2560px !important');
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
