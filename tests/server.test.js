const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
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
      readingTime: 3,
      html: '<p>Rendered</p>'
    });

    expect(html).toContain('Meta Test | Kernel Notes');
    expect(html).toContain('Node · 03.03.2026 · 3 Min. Lesezeit');
    expect(html).not.toContain('GMT');
    expect(html).toContain('data-reading-progress');
    expect(html).toContain('data-tooltip="Aufrufe');
    expect(html).toContain('Für später speichern');
    expect(html).toContain('data-article-share');
    expect(html).toContain('>Linux<');
    expect(html).toContain('<p>Rendered</p>');
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
