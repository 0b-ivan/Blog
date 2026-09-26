const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const request = require('supertest');

const {
  createApp,
  slugify,
  excerptFromBody,
  parseDate,
  normalizeTags,
  slugFromWikiName,
  inferDateFromSlug,
  recoverMetadata,
  resolvePostBySlug,
  readPosts,
  renderPostPage
} = require('../server');

async function writePost(dir, name, content) {
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

describe('blog server', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('slugify removes .md extension', () => {
    expect(slugify('hello-world.md')).toBe('hello-world');
  });

  it('parseDate returns 0 for invalid input', () => {
    expect(parseDate('not-a-date')).toBe(0);
  });

  it('normalizeTags handles array and comma-separated string', () => {
    expect(normalizeTags(['DevOps', ' Security '])).toEqual(['DevOps', 'Security']);
    expect(normalizeTags('Linux, Security , CI/CD')).toEqual(['Linux', 'Security', 'CI/CD']);
  });

  it('slugFromWikiName creates clean post slug', () => {
    expect(slugFromWikiName('Zero Downtime Deployments')).toBe('zero-downtime-deployments');
    expect(slugFromWikiName('Cloudflare Tunnel haerten')).toBe('cloudflare-tunnel-haerten');
    expect(slugFromWikiName('Schroeder & Soehne: Uebergroesse')).toBe('schroeder-soehne-uebergroesse');
    expect(slugFromWikiName('Sicherheit für Öl und Straße')).toBe('sicherheit-fuer-oel-und-strasse');
  });

  it('inferDateFromSlug extracts YYYY-MM-DD prefix', () => {
    expect(inferDateFromSlug('2026-08-19-example-post')).toBe('2026-08-19');
    expect(inferDateFromSlug('example-post')).toBe('');
  });

  it('excerptFromBody strips markdown chars and truncates long text', () => {
    const text = '# Title **bold** (note) [link](x) ' + 'x'.repeat(220);
    const excerpt = excerptFromBody(text);
    expect(excerpt.includes('#')).toBe(false);
    expect(excerpt.length).toBeLessThanOrEqual(183);
    expect(excerpt.endsWith('...')).toBe(true);
  });

  it('readPosts parses and sorts by date descending', async () => {
    await writePost(
      tmpDir,
      '2026-01-01-old.md',
      '---\ntitle: Old\ndate: 2026-01-01\ncategory: Ops\n---\nOld content'
    );
    await writePost(
      tmpDir,
      '2026-02-01-new.md',
      '---\ntitle: New\ndate: 2026-02-01\ncategory: DevOps\ntags:\n  - Linux\n  - Docker\n---\nNew content'
    );

    const posts = await readPosts(tmpDir);
    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('New');
    expect(posts[1].title).toBe('Old');
    expect(posts[0].html).toContain('<p>New content</p>');
    expect(posts[0].tags).toEqual(['Linux', 'Docker']);
    expect(posts[0].readingTime).toBe(1);
  });

  it('reads optional cover title metadata without changing the canonical title', async () => {
    await writePost(
      tmpDir,
      'cover-title.md',
      `---
title: "Long canonical article title"
cover_title: "Short cover title"
cover_subtitle: "Readable cover subtitle"
date: 2026-09-24
category: DevOps
---
Body
`
    );

    const posts = await readPosts(tmpDir);
    expect(posts[0]).toMatchObject({
      title: 'Long canonical article title',
      coverTitle: 'Short cover title',
      coverSubtitle: 'Readable cover subtitle'
    });
  });

  it('moves cover attribution into the article sources section', async () => {
    await writePost(
      tmpDir,
      'cover-source.md',
      `---
title: Cover Source
date: 2026-09-23
category: DevOps
cover_image: /assets/covers/cover-source.jpg
cover_credit: by Example via Pixabay
cover_credit_url: https://pixabay.com/photos/example-42/
cover_source_url: https://pixabay.com/photos/example-42/
cover_license: Pixabay Content License
cover_license_url: https://pixabay.com/service/license-summary/
---
Body

## Quellen

- [Docker Docs](/sources.html#docker-compose)
`
    );

    const posts = await readPosts(tmpDir);
    expect(posts[0].html).toContain('/sources.html#cover-cover-source');
    expect(posts[0].html).toContain('Coverbild: Example via Pixabay');
    expect(posts[0].html).not.toContain('https://pixabay.com/photos/example-42/');
  });

  it('api returns post list dto', async () => {
    await writePost(
      tmpDir,
      'sample.md',
      '---\ntitle: Sample\ndate: 2026-04-01\ncategory: Security\nexcerpt: Custom excerpt\ntags: Linux,Security\n---\nBody'
    );

    const app = createApp({ postsDir: tmpDir });
    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      slug: 'sample',
      title: 'Sample',
      category: 'Security',
      tags: ['Linux', 'Security'],
      excerpt: 'Custom excerpt',
      readingTime: 1
    });
    expect(res.body[0].html).toBeUndefined();
  });

  it('api returns legal info payload', async () => {
    const app = createApp({ postsDir: tmpDir });
    const res = await request(app).get('/api/legal-info');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      operatorName: expect.any(String),
      street: expect.any(String),
      email: expect.any(String)
    });
  });

  it('proxies PDF preparation state and warms the PDF when an article is opened', async () => {
    await writePost(
      tmpDir,
      'warm-me.md',
      '---\ntitle: Warm Me\ndate: 2026-05-01\ncategory: Docs\n---\nBody'
    );

    const fetchMock = globalThis.vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options = {}) => ({
      status: options.method === 'POST' ? 202 : 200,
      json: async () => options.method === 'POST'
        ? { ready: false, preparing: true }
        : { ready: true, preparing: false }
    }));

    try {
      const app = createApp({
        postsDir: tmpDir,
        pdfServiceUrl: 'http://pdf:8092'
      });

      const prepare = await request(app).post('/api/pdf/warm-me/prepare');
      expect(prepare.status).toBe(202);
      expect(prepare.body).toMatchObject({ ready: false, preparing: true });

      const status = await request(app).get('/api/pdf/warm-me/status');
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ ready: true, preparing: false });

      const article = await request(app).get('/posts/warm-me');
      expect(article.status).toBe(200);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://pdf:8092/prepare/warm-me',
        expect.objectContaining({ method: 'POST' })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'http://pdf:8092/status/warm-me',
        expect.objectContaining({ method: 'GET' })
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('post detail route renders html and 404 for missing slug', async () => {
    await writePost(
      tmpDir,
      'deep-dive.md',
      '---\ntitle: Deep Dive\ndate: 2026-05-01\ncategory: JS\n---\n# Header\n\nDetails'
    );

    const app = createApp({ postsDir: tmpDir });

    const ok = await request(app).get('/posts/deep-dive');
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('Deep Dive | Kernel Notes');
    expect(ok.text).toContain('<h1>Header</h1>');

    const notFound = await request(app).get('/posts/does-not-exist');
    expect(notFound.status).toBe(404);
  });

  it('download routes return EPUB and LaTeX-rendered PDF with attachment headers', async () => {
    await writePost(
      tmpDir,
      'download-me.md',
      '---\ntitle: Download Me\ndate: 2026-05-02\ncategory: Docs\n---\nBody'
    );

    const buildArticleEpub = globalThis.vi.fn(async () => Buffer.from('epub-bytes'));
    const buildArticlePdf = globalThis.vi.fn(async () => Buffer.from('%PDF-fake'));
    const app = createApp({
      postsDir: tmpDir,
      ebookExporterLoader: () => ({ buildArticleEpub, buildArticlePdf })
    });

    const epub = await request(app).get('/download/download-me.epub');
    expect(epub.status).toBe(200);
    expect(epub.headers['content-type']).toMatch(/application\/epub\+zip/);
    expect(epub.headers['content-disposition']).toContain('download-me.epub');
    expect(buildArticleEpub).toHaveBeenCalledOnce();

    const pdf = await request(app).get('/download/download-me.pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toContain('download-me.pdf');
    expect(buildArticlePdf).toHaveBeenCalledOnce();
  });

  it('reuses a cached EPUB for repeated downloads of the same article', async () => {
    await writePost(
      tmpDir,
      'cache-me.md',
      '---\ntitle: Cache Me\ndate: 2026-09-26\ncategory: Docs\nversion: 3\nupdated_at: 2026-09-26T00:00:00.000Z\n---\nBody'
    );

    const buildArticleEpub = globalThis.vi.fn(async () => Buffer.from('cached-epub'));
    const app = createApp({
      postsDir: tmpDir,
      ebookExporterLoader: () => ({
        buildArticleEpub,
        buildArticlePdf: globalThis.vi.fn()
      })
    });

    const first = await request(app).get('/download/cache-me.epub');
    const second = await request(app).get('/download/cache-me.epub');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(buildArticleEpub).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight EPUB build across concurrent requests for the same article', async () => {
    await writePost(
      tmpDir,
      'singleflight.md',
      '---\ntitle: Singleflight\ndate: 2026-09-26\ncategory: Docs\n---\nBody'
    );

    let releaseBuild;
    const buildGate = new Promise((resolve) => {
      releaseBuild = resolve;
    });
    const buildArticleEpub = globalThis.vi.fn(async () => {
      await buildGate;
      return Buffer.from('singleflight-epub');
    });
    const app = createApp({
      postsDir: tmpDir,
      ebookExporterLoader: () => ({
        buildArticleEpub,
        buildArticlePdf: globalThis.vi.fn()
      })
    });

    const firstRequest = request(app)
      .get('/download/singleflight.epub')
      .then((response) => response);
    const secondRequest = request(app)
      .get('/download/singleflight.epub')
      .then((response) => response);

    await delay(20);
    expect(buildArticleEpub).toHaveBeenCalledTimes(1);

    releaseBuild();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(buildArticleEpub).toHaveBeenCalledTimes(1);
  });

  it('serializes uncached EPUB builds to cap renderer memory pressure', async () => {
    await writePost(
      tmpDir,
      'first-book.md',
      '---\ntitle: First Book\ndate: 2026-09-26\ncategory: Docs\n---\nBody'
    );
    await writePost(
      tmpDir,
      'second-book.md',
      '---\ntitle: Second Book\ndate: 2026-09-26\ncategory: Docs\n---\nBody'
    );

    let activeBuilds = 0;
    let maximumActiveBuilds = 0;
    const buildArticleEpub = globalThis.vi.fn(async (post) => {
      activeBuilds += 1;
      maximumActiveBuilds = Math.max(maximumActiveBuilds, activeBuilds);
      await delay(25);
      activeBuilds -= 1;
      return Buffer.from(`epub-${post.slug}`);
    });
    const app = createApp({
      postsDir: tmpDir,
      ebookExporterLoader: () => ({
        buildArticleEpub,
        buildArticlePdf: globalThis.vi.fn()
      })
    });

    const [first, second] = await Promise.all([
      request(app).get('/download/first-book.epub'),
      request(app).get('/download/second-book.epub')
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(buildArticleEpub).toHaveBeenCalledTimes(2);
    expect(maximumActiveBuilds).toBe(1);
  });

  it('download route returns 404 for unknown articles and formats', async () => {
    const app = createApp({
      postsDir: tmpDir,
      ebookExporterLoader: () => ({
        buildArticleEpub: globalThis.vi.fn(),
        buildArticlePdf: globalThis.vi.fn()
      })
    });

    expect((await request(app).get('/download/missing.epub')).status).toBe(404);
    expect((await request(app).get('/download/missing.txt')).status).toBe(404);
  });

  it('post detail route resolves slug without date prefix', async () => {
    await writePost(
      tmpDir,
      '2026-08-04-systemd-timer-statt-cron.md',
      '---\ntitle: Timer\ndate: 2026-08-04\ncategory: Linux\n---\nBody'
    );

    const app = createApp({ postsDir: tmpDir });
    const res = await request(app).get('/posts/systemd-timer-statt-cron');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Timer | Kernel Notes');
  });

  it('resolvePostBySlug matches exact and suffix slugs', () => {
    const posts = [
      { slug: '2026-08-04-systemd-timer-statt-cron' },
      { slug: '2026-08-18-zero-downtime-mit-compose' }
    ];

    expect(resolvePostBySlug(posts, '2026-08-18-zero-downtime-mit-compose')).toEqual(posts[1]);
    expect(resolvePostBySlug(posts, 'systemd-timer-statt-cron')).toEqual(posts[0]);
    expect(resolvePostBySlug(posts, 'unknown')).toBeNull();
  });

  it('resolvePostBySlug matches umlaut and ascii variants', () => {
    const posts = [{ slug: '2026-08-12-cloudflare-tunnel-haerten' }];
    expect(resolvePostBySlug(posts, 'cloudflare-tunnel-härten')).toEqual(posts[0]);
    expect(resolvePostBySlug(posts, 'cloudflare-tunnel-haerten')).toEqual(posts[0]);
  });

  it('recoverMetadata parses plain key/value header when parser metadata is empty', () => {
    const raw = 'title: Header Title\ncategory: Security\ntags: Linux, Ops\n\nBody line';
    const recovered = recoverMetadata(raw, { data: {}, content: raw });

    expect(recovered.data.title).toBe('Header Title');
    expect(recovered.data.category).toBe('Security');
    expect(recovered.content).toContain('Body line');
    expect(recovered.content).not.toContain('title: Header Title');
  });

  it('readPosts does not render metadata header inside article content', async () => {
    await writePost(
      tmpDir,
      '2026-08-20-metadata-leak.md',
      'title: Leak Test\ncategory: IT\n\nThis is content.'
    );

    const posts = await readPosts(tmpDir);
    expect(posts[0].title).toBe('Leak Test');
    expect(posts[0].html).toContain('<p>This is content.</p>');
    expect(posts[0].html).not.toContain('title: Leak Test');
  });

  it('health endpoint returns ok', async () => {
    const app = createApp({ postsDir: tmpDir });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('readPosts returns empty list for missing directory', async () => {
    const missing = path.join(tmpDir, 'missing-posts');
    const posts = await readPosts(missing);
    expect(posts).toEqual([]);
  });

  it('renderPostPage embeds metadata and html', () => {
    const html = renderPostPage({
      slug: 'meta-test',
      title: 'Meta Test',
      date: '2026-03-03',
      category: 'Node',
      tags: ['Linux'],
      excerpt: 'Excerpt',
      coverCredit: 'by Example via Pixabay',
      coverCreditUrl: 'https://pixabay.com/photos/example-42/',
      coverLicense: 'Pixabay Content License',
      coverLicenseUrl: 'https://pixabay.com/service/license-summary/',
      readingTime: 3,
      html: '<p>Rendered</p>'
    });

    expect(html).toContain('Meta Test | Kernel Notes');
    expect(html).toContain('Node · 03.03.2026 · 3 Min. Lesezeit');
    expect(html).toContain('terminal-post terminal-post--article');
    expect(html).toContain('article-hero__chrome');
    expect(html).not.toContain('article-hero--has-cover');
    expect(html).toContain('/blog/node');
    expect(html).toContain('# linux');
    expect(html).not.toContain('article-hero__lights');
    expect(html).toContain('data-terminal-action="overview"');
    expect(html).toContain('data-terminal-action="restore"');
    expect(html).toContain('data-terminal-action="maximize"');
    expect(html).toContain('article-hero__prompt');
    expect(html).toContain('<svg viewBox="0 0 64 48" focusable="false">');
    expect(html).toContain('article-hero__excerpt');
    expect(html).toContain('>Excerpt<');
    expect(html).not.toContain('article-hero__credit');
    expect(html).not.toContain('by Example via Pixabay');
    expect(html).not.toContain('Pixabay Content License');
    expect(html).toMatch(/terminal-post terminal-post--article[\s\S]*article-hero[\s\S]*terminal-content[\s\S]*<\/section>[\s\S]*article-post-meta/);
    expect(html).not.toContain('article-terminal__meta-strip');
    expect(html).toMatch(/\/assets\/css\/article-metrics\.css\?v=[^"]+/);
    expect(html).toMatch(/\/styles\.css\?v=[^"]+/);
    expect(html).not.toContain('article-hero-transition');
    expect(html).not.toContain('GMT');
    expect(html).toContain('data-reading-progress');
    expect(html).toContain('data-reading-progress-toggle');
    expect(html).toContain('data-reading-progress-meter');
    expect(html).toContain('data-reading-progress-value-compact');
    expect(html).toContain('reading-progress__bubble-fill');
    expect(html).toContain('data-reading-progress-rive');
    expect(html).not.toContain('<script src="/vendor/rive/rive.js"');
    expect(html).toMatch(/\/assets\/article-analytics\.js\?v=[^"]+/);
    expect(html).toMatch(/\/assets\/article-hero-motion\.js\?v=[^"]+/);
    expect(html).toMatch(/\/script\.js\?v=[^"]+/);
    expect(html).not.toContain('reading-progress__ring');
    expect(html).toContain('data-tooltip="Aufrufe');
    expect(html).toContain('Herunterladen');
    expect(html).toContain('/download/meta-test.epub');
    expect(html).toContain('/download/meta-test.pdf');
    expect(html).toContain('data-article-share');
    expect(html).toContain('>Linux<');
    expect(html).toContain('<p>Rendered</p>');
  });

  it('renders a local article cover on the shared terminal surface', () => {
    const html = renderPostPage({
      slug: 'covered-post',
      title: 'Covered Post',
      date: '2026-09-23',
      category: 'DevOps',
      tags: ['Kubernetes'],
      excerpt: 'Covered excerpt',
      coverImage: '/assets/covers/covered-post.jpg',
      coverFocus: 'top',
      readingTime: 4,
      html: '<p>Rendered</p>'
    });

    expect(html).toContain('class="terminal-post terminal-post--article terminal-post--has-cover"');
    expect(html).toContain('aria-label="Artikel im Terminal" style="--article-cover-image: url(/assets/covers/covered-post.jpg)');
    expect(html).toContain('class="article-hero article-hero--has-cover" data-article-hero>');
    expect(html).not.toContain('data-article-hero style=');
    expect(html).toContain('--article-cover-focus: top');
    expect(html).toContain('--article-cover-overlay: linear-gradient(180deg');
    expect(html).toMatch(/\/assets\/css\/article-metrics\.css\?v=[^"]+/);
    expect(html).toMatch(/\/styles\.css\?v=[^"]+/);
  });

  it('markdown renderer supports wiki-links, footnotes, admonitions and mermaid fences', async () => {
    await writePost(
      tmpDir,
      '2026-08-04-systemd-timer-statt-cron.md',
      '---\ntitle: Timer\ndate: 2026-08-04\ncategory: Linux\n---\nBody'
    );
    await writePost(
      tmpDir,
      'features.md',
      '---\ntitle: Features\ndate: 2026-07-01\ncategory: Docs\n---\n[[Systemd Timer Statt Cron]]\n\nText mit Fussnote.[^1]\n\n[^1]: Hinweis\n\n::: warning Achtung\nBitte sichern.\n:::\n\n```mermaid\nflowchart TD\nA-->B\n```'
    );

    const posts = await readPosts(tmpDir);
    const features = posts.find((post) => post.slug === 'features');
    const html = features.html;
    expect(html).toContain('/posts/systemd-timer-statt-cron');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('admonition-warning');
    expect(html).toContain('<pre class="mermaid">');
  });

  it('renders wiki-links to unpublished posts as plain text', async () => {
    await writePost(
      tmpDir,
      'features.md',
      '---\ntitle: Features\ndate: 2026-07-01\ncategory: Docs\n---\nSiehe [[Noch Nicht Veröffentlicht|kommenden Artikel]].'
    );

    const posts = await readPosts(tmpDir);
    expect(posts[0].html).toContain('kommenden Artikel');
    expect(posts[0].html).not.toContain('/posts/noch-nicht-veroeffentlicht');
  });

  it('api returns 500 when posts path is not a directory', async () => {
    const invalidPostsPath = path.join(tmpDir, 'not-a-directory');
    await fs.writeFile(invalidPostsPath, 'not a directory', 'utf-8');

    const app = createApp({ postsDir: invalidPostsPath });
    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Could not load posts' });
  });

  it('post detail returns 500 when posts path is not a directory', async () => {
    const invalidPostsPath = path.join(tmpDir, 'not-a-directory');
    await fs.writeFile(invalidPostsPath, 'not a directory', 'utf-8');

    const app = createApp({ postsDir: invalidPostsPath });
    const res = await request(app).get('/posts/example');

    expect(res.status).toBe(500);
    expect(res.text).toBe('Could not render post');
  });

  it('fallback route serves the blog index', async () => {
    const app = createApp({ postsDir: tmpDir });
    const res = await request(app).get('/route-that-does-not-exist');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Kernel Notes');
  });
});
