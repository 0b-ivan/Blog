const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const {
  createApp,
  getSiteUrl,
  escapeXml,
  escapeCdata,
  absolutizeHtml,
  rssDate,
  generateRssFeed
} = require('../server');

async function writePost(dir, name, content) {
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

describe('RSS feed', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-rss-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('normalizes site URLs and escapes XML and CDATA safely', () => {
    expect(getSiteUrl('https://example.test///')).toBe('https://example.test');
    expect(escapeXml('AWS & Linux <Cloud> "Notes"')).toBe(
      'AWS &amp; Linux &lt;Cloud&gt; &quot;Notes&quot;'
    );
    expect(escapeCdata('before ]]> after')).toBe('before ]]]]><![CDATA[> after');
    expect(rssDate('not-a-date')).toBe('');
  });

  it('generates RSS 2.0 with full article content and absolute URLs', () => {
    const feed = generateRssFeed(
      [
        {
          slug: 'aws-linux',
          title: 'AWS & Linux <Notes>',
          date: '2026-08-19',
          category: 'Cloud & Ops',
          tags: ['AWS', 'Linux'],
          excerpt: 'Kurz & praktisch',
          html: '<p><a href="/posts/other">Weiter</a><img src="/assets/example.png"></p>'
        }
      ],
      'https://example.test/'
    );

    expect(feed).toContain('<rss version="2.0"');
    expect(feed).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
    expect(feed).toContain('<title>AWS &amp; Linux &lt;Notes&gt;</title>');
    expect(feed).toContain('<description>Kurz &amp; praktisch</description>');
    expect(feed).toContain('<category>Cloud &amp; Ops</category>');
    expect(feed).toContain('<link>https://example.test/posts/aws-linux</link>');
    expect(feed).toContain('href="https://example.test/posts/other"');
    expect(feed).toContain('src="https://example.test/assets/example.png"');
    expect(feed).toContain('<content:encoded><![CDATA[');
  });

  it('publishes at most the latest 20 supplied posts', () => {
    const posts = Array.from({ length: 25 }, (_value, index) => ({
      slug: `post-${index}`,
      title: `Post ${index}`,
      date: `2026-08-${String(25 - index).padStart(2, '0')}`,
      category: 'IT',
      tags: [],
      excerpt: `Excerpt ${index}`,
      html: `<p>Post ${index}</p>`
    }));

    const feed = generateRssFeed(posts, 'https://example.test');
    expect((feed.match(/<item>/g) || [])).toHaveLength(20);
    expect(feed).toContain('/posts/post-19');
    expect(feed).not.toContain('/posts/post-20');
  });

  it('serves rss.xml with newest posts first and the correct content type', async () => {
    await writePost(
      tmpDir,
      '2026-08-18-old.md',
      '---\ntitle: Old Post\ndate: 2026-08-18\ncategory: Linux\ntags: Linux\n---\nOld body'
    );
    await writePost(
      tmpDir,
      '2026-08-19-new.md',
      '---\ntitle: New Post\ndate: 2026-08-19\ncategory: AWS\ntags: AWS,Security\n---\n[[Old Post]]'
    );

    const app = createApp({ postsDir: tmpDir, siteUrl: 'https://rss.example.test/' });
    const response = await request(app).get('/rss.xml');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.text.indexOf('New Post')).toBeLessThan(response.text.indexOf('Old Post'));
    expect(response.text).toContain('https://rss.example.test/posts/2026-08-19-new');
    expect(response.text).toContain('href="https://rss.example.test/posts/old-post"');
  });

  it('returns 500 when the feed cannot read the posts directory', async () => {
    const invalidPostsPath = path.join(tmpDir, 'not-a-directory');
    await fs.writeFile(invalidPostsPath, 'not a directory', 'utf-8');

    const app = createApp({ postsDir: invalidPostsPath, siteUrl: 'https://example.test' });
    const response = await request(app).get('/rss.xml');

    expect(response.status).toBe(500);
    expect(response.text).toBe('Could not generate RSS feed');
  });

  it('renders an empty but valid channel when there are no posts', () => {
    const feed = generateRssFeed([], 'https://example.test');

    expect(feed).toContain('<channel>');
    expect(feed).toContain('<atom:link href="https://example.test/rss.xml"');
    expect(feed).not.toContain('<item>');
    expect(feed).not.toContain('<lastBuildDate>');
  });

  it('absolutizes single-quoted root-relative content without touching external URLs', () => {
    const html = absolutizeHtml(
      "<a href='/posts/test'>Test</a><a href='https://openai.com'>Extern</a>",
      'https://example.test/'
    );

    expect(html).toContain("href='https://example.test/posts/test'");
    expect(html).toContain("href='https://openai.com'");
  });
});
