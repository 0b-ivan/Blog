const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildColophon,
  buildCoverSvg,
  buildEditorialCoverSvg,
  buildPhotoCoverSvg,
  containsCjkText,
  createDeckblatt,
  createEditorialCoverAssets,
  createEpubCover,
  displayAuthor,
  ensureCoverImageProperty,
  ensureDeckblattFixedLayout,
  ensureDeckblattItemrefProperties,
  estimateCoverTagWidth,
  estimateCoverTextWidth,
  fitCoverTitle,
  hasEditorialCoverMetadata,
  selectCoverTags,
  normalizeEpubDate,
  prepareChapterHtml,
  wrapCoverTitle
} = require('../lib/ebook-export');

function textLinesByClass(svg, className) {
  const pattern = new RegExp(
    '<text\\b[^>]*class="' + className + '"[^>]*>([^<]*)<\\/text>',
    'g'
  );
  return [...String(svg || '').matchAll(pattern)].map((match) => match[1]);
}

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

  it('fits long editorial titles inside the safe cover width', () => {
    const title = 'Gold glänzt nicht immer: Warum ich Golden Images trotzdem mag';
    const layout = fitCoverTitle(title, {
      maxWidth: 1180,
      maxLines: 4,
      maxFontSize: 128,
      minFontSize: 84,
      step: 4
    });

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.length).toBeLessThanOrEqual(4);
    expect(layout.lines.join(' ')).toBe(title);
    for (const line of layout.lines) {
      expect(estimateCoverTextWidth(line, layout.fontSize)).toBeLessThanOrEqual(1180);
    }

    const svg = buildEditorialCoverSvg({
      title,
      excerpt: 'Golden Images sparen Zeit und sorgen für reproduzierbare Server-Setups.',
      author: 'obivan',
      category: 'AWS',
      tags: ['AWS', 'EC2', 'AMI', 'Image-Builder', 'Golden-Image'],
      date: '2026-09-04'
    }, 'data:image/png;base64,ZmFrZQ==');

    for (const line of layout.lines) {
      expect(svg).toContain(line);
    }
    expect(svg).not.toContain('font-size:136px');
  });

  it('keeps the explicit Pokémon cover title inside the same safe width', () => {
    const title = 'Pokémon als OOP-Modell';
    const layout = fitCoverTitle(title, {
      maxWidth: 1180,
      maxLines: 4,
      maxFontSize: 128,
      minFontSize: 84,
      step: 4
    });

    expect(layout.lines.join(' ')).toBe(title);
    for (const line of layout.lines) {
      expect(estimateCoverTextWidth(line, layout.fontSize)).toBeLessThanOrEqual(1180);
    }

    const svg = buildEditorialCoverSvg({
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      coverTitle: title,
      coverSubtitle: 'Warum Komposition besser skaliert als FirePokemon extends Pokemon',
      author: 'obivan',
      category: 'Engineering',
      tags: ['Pokémon', 'Java', 'OOP'],
      date: '2026-09-24'
    }, 'data:image/jpeg;base64,ZmFrZQ==');

    expect(textLinesByClass(svg, 'title').join(' ')).toBe(title);
  });

  it('omits tags that are too wide for the editorial cover column', () => {
    const tags = selectCoverTags([
      'Kubernetes',
      'K3s',
      'Proxmox',
      'Chaos-Engineering',
      'GitOps',
      'Flux',
      'Observability'
    ], {
      maxWidth: 315,
      maxTags: 5
    });

    expect(tags).toEqual([
      'KUBERNETES',
      'K3S',
      'PROXMOX',
      'GITOPS',
      'FLUX'
    ]);
    expect(estimateCoverTagWidth('CHAOS ENGINEERING')).toBeGreaterThan(315);

    const svg = buildEditorialCoverSvg({
      title: 'K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog',
      excerpt: 'Kubernetes Pod Failover mit Chaos Engineering.',
      author: 'obivan',
      category: 'DevOps',
      tags: [
        'Kubernetes',
        'K3s',
        'Proxmox',
        'Chaos-Engineering',
        'GitOps',
        'Flux'
      ],
      date: '2026-09-20'
    }, 'data:image/jpeg;base64,ZmFrZQ==');

    expect(svg).toContain('>KUBERNETES</text>');
    expect(svg).toContain('>GITOPS</text>');
    expect(svg).toContain('>FLUX</text>');
    expect(svg).not.toContain('>CHAOS ENGINEERING</text>');
  });

  it('keeps editorial artwork visually subordinate to the cover typography', () => {
    const svg = buildEditorialCoverSvg({
      title: 'DOOM veränderte mehr als Shooter',
      excerpt: 'Von Commander Keen über Shareware und Deathmatch bis DOOM auf Embedded-Hardware',
      author: 'obivan',
      category: 'Gaming',
      tags: ['DOOM', 'id-Software', 'Shareware', 'Retro-Gaming', 'Open-Source'],
      date: '2026-09-24'
    }, 'data:image/png;base64,ZmFrZQ==');

    expect(svg).toContain('opacity="0.82" preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('<stop offset="0.4" stop-color="#ffffff" stop-opacity="0.34"/>');
    expect(svg).toContain('<stop offset="1" stop-color="#ffffff" stop-opacity="0.10"/>');
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

  it('uses the editorial Kernel Notes cover for every article', () => {
    expect(hasEditorialCoverMetadata({
      title: 'Long title'
    })).toBe(true);
    expect(hasEditorialCoverMetadata({
      title: 'Long title',
      cover_title: 'Short title',
      cover_subtitle: 'Readable subtitle'
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

    expect(textLinesByClass(svg, 'title').join(' ')).toBe(
      'Chaos Engineering systematisch testen'
    );
    expect(textLinesByClass(svg, 'subtitle').join(' ')).toBe(
      'Warum Chaos Monkey kein Zufall ist'
    );
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

  it('rasterizes one editorial PNG and reuses it for cover and deckblatt', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-shared-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      let rasterizeCalls = 0;
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]);
      const assets = await createEditorialCoverAssets({
        slug: 'demo',
        title: 'Shared editorial cover',
        author: 'obivan',
        category: 'DevOps',
        date: '2026-09-26',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot, {
        rasterizeSvg: async () => {
          rasterizeCalls += 1;
          return fakePng;
        }
      });

      expect(rasterizeCalls).toBe(1);
      expect(assets.cover.name).toBe('demo-cover.png');
      expect(Buffer.from(await assets.cover.arrayBuffer())).toEqual(fakePng);
      expect(assets.deckblatt.html).toContain('deckblatt.png');
      expect(assets.deckblatt.html).toContain('book-deckblatt--editorial');
      await assets.deckblatt.cleanup();
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('loads the large CJK cover font only for covers that contain CJK text', () => {
    expect(containsCjkText('Kernel Notes für Kubernetes')).toBe(false);
    expect(containsCjkText('Pac-Man und パクパク')).toBe(true);
  });

  it('rasterizes the portrait editorial artwork for the EPUB library cover', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-editorial-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      let capturedSvg = '';
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const cover = await createEpubCover({
        slug: 'demo',
        title: 'A very long article title',
        coverTitle: 'Short cover title',
        coverSubtitle: 'Readable subtitle',
        author: 'obivan',
        category: 'DevOps',
        date: '2026-09-24',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot, {
        rasterizeSvg: async (svg) => {
          capturedSvg = svg;
          return fakePng;
        }
      });

      expect(cover.name).toBe('demo-cover.png');
      expect(cover.type).toBe('image/png');
      expect(Buffer.from(await cover.arrayBuffer())).toEqual(fakePng);
      expect(capturedSvg).toContain('Short cover title');
      expect(capturedSvg).toContain('Readable subtitle');
      expect(capturedSvg).toContain('data:image/jpeg;base64,');
      expect(capturedSvg).toContain('fill="url(#imageFade)"');
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('uses a full-page editorial deckblatt for normal articles', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-editorial-deckblatt-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const deckblatt = await createDeckblatt({
        slug: 'demo',
        title: 'Long article title',
        coverTitle: 'Short cover title',
        coverSubtitle: 'Readable subtitle',
        author: 'obivan',
        category: 'DevOps',
        date: '2026-09-24',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot, 'https://blog.obivan.org', {
        rasterizeSvg: async () => fakePng
      });

      expect(deckblatt.html).toContain('book-deckblatt--editorial');
      expect(deckblatt.html).toContain('<img src="file://');
      expect(deckblatt.html).toContain('deckblatt.png');
      expect(deckblatt.html).toContain('alt="Deckblatt: Short cover title"');
      expect(deckblatt.html).not.toContain('<svg');
      await deckblatt.cleanup();
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('uses title and excerpt fallbacks for ordinary articles with a cover image', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-default-editorial-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      let capturedSvg = '';
      const cover = await createEpubCover({
        slug: 'ordinary',
        title: 'Ordinary blog article',
        excerpt: 'This excerpt becomes the cover subtitle automatically.',
        author: 'obivan',
        category: 'IT',
        tags: ['Linux', 'Self-Hosting'],
        date: '2026-09-25',
        coverImage: '/assets/covers/demo.jpg'
      }, assetRoot, {
        rasterizeSvg: async (svg) => {
          capturedSvg = svg;
          return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        }
      });

      expect(cover.name).toBe('ordinary-cover.png');
      expect(cover.type).toBe('image/png');
      expect(textLinesByClass(capturedSvg, 'title').join(' ')).toBe(
        'Ordinary blog article'
      );
      expect(textLinesByClass(capturedSvg, 'subtitle').join(' ')).toBe(
        'This excerpt becomes the cover subtitle automatically.'
      );
      expect(capturedSvg).toContain('LINUX');
      expect(capturedSvg).toContain('SELF HOSTING');
      expect(capturedSvg).toContain('Ivan Babayev');
    } finally {
      await fs.rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('rasterizes generated covers when no article photo exists', async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    let capturedSvg = '';

    const cover = await createEpubCover({
      slug: 'generated',
      title: 'Generated Cover',
      author: 'obivan',
      category: 'DevOps',
      date: '2026-09-24'
    }, '/tmp/does-not-matter', {
      rasterizeSvg: async (svg) => {
        capturedSvg = svg;
        return fakePng;
      }
    });

    expect(cover.name).toBe('generated-cover.png');
    expect(cover.type).toBe('image/png');
    expect(Buffer.from(await cover.arrayBuffer())).toEqual(fakePng);
    expect(capturedSvg).toContain('Generated Cover');
  });

  it('keeps a raw raster fallback only for titleless non-article inputs', async () => {
    const assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-cover-'));
    try {
      const coverDir = path.join(assetRoot, 'assets', 'covers');
      await fs.mkdir(coverDir, { recursive: true });
      const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      await fs.writeFile(path.join(coverDir, 'demo.jpg'), image);

      const cover = await createEpubCover({
        slug: 'demo',
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

  it('keeps the 1600x2560 raster deckblatt full-width without vh or flex sizing', () => {
    const xhtml = '<html><head><title>Deckblatt</title></head><body><div class="book-deckblatt"><img src="cover.png" /></div></body></html>';
    const patched = ensureDeckblattFixedLayout(xhtml);

    expect(patched).toContain('width=device-width, initial-scale=1.0');
    expect(patched).toContain('margin: 0 !important');
    expect(patched).toContain('width: 100% !important');
    expect(patched).toContain('height: auto !important');
    expect(patched).toContain('max-height: none !important');
    expect(patched).not.toContain('100vh');
    expect(patched).not.toContain('display: flex');
    expect(patched).not.toContain('object-fit');
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
