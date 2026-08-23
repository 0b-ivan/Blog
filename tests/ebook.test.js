const fs = require('node:fs');
const path = require('node:path');

const {
  parseFrontmatter,
  rewriteBody,
  renderBookMarkdown,
  resolvePostSlug,
  stripManagedGlossary
} = require('../scripts/build-ebook');

describe('ebook build', () => {
  const posts = [
    {
      slug: '2026-08-18-zero-downtime-mit-compose',
      title: 'Zero-Downtime Deployments mit Docker Compose',
      date: '2026-08-18',
      category: 'DevOps',
      content: 'Inhalt'
    },
    {
      slug: '2026-08-19-rss-ist-nicht-tot',
      title: 'RSS ist nicht tot',
      date: '2026-08-19',
      category: 'Self-Hosting',
      content: 'Inhalt'
    }
  ];

  it('parses simple frontmatter without a YAML dependency', () => {
    const parsed = parseFrontmatter('---\ntitle: "Test: mit Doppelpunkt"\ndate: 2026-08-22\n---\n\nText');

    expect(parsed.data.title).toBe('Test: mit Doppelpunkt');
    expect(parsed.data.date).toBe('2026-08-22');
    expect(parsed.content.trim()).toBe('Text');
  });

  it('resolves wiki-style names to real dated post slugs', () => {
    expect(resolvePostSlug('Zero Downtime Mit Compose', posts)).toBe(
      '2026-08-18-zero-downtime-mit-compose'
    );
  });

  it('rewrites ebook links outside code fences and removes managed glossary blocks', () => {
    const markdown = [
      'Siehe [[Zero Downtime Mit Compose|Compose]].',
      '',
      '![Bild](/assets/posts/demo.svg)',
      '',
      '[Snippet](/snippets/example/01.sh "snippet:bash")',
      '',
      '```text',
      '[[Zero Downtime Mit Compose]] /assets/posts/demo.svg',
      '```',
      '',
      '<!-- glossary:start -->',
      '*[VPC]: Virtual Private Cloud',
      '<!-- glossary:end -->'
    ].join('\n');

    const rewritten = rewriteBody(markdown, posts, 'https://blog.obivan.org');

    expect(rewritten).toContain('[Compose](#post-2026-08-18-zero-downtime-mit-compose)');
    expect(rewritten).toContain('![Bild](assets/posts/demo.svg)');
    expect(rewritten).toContain('[Snippet](https://blog.obivan.org/snippets/example/01.sh "snippet:bash")');
    expect(rewritten).toContain('[[Zero Downtime Mit Compose]] /assets/posts/demo.svg');
    expect(rewritten).not.toContain('glossary:start');
    expect(stripManagedGlossary(markdown)).not.toContain('*[VPC]:');
  });

  it('builds chapters, online links and a glossary appendix', () => {
    const markdown = renderBookMarkdown(
      posts,
      [
        {
          key: 'VPC',
          full: 'Virtual Private Cloud',
          short: 'Virtuelles Netzwerk.',
          description: 'Ein logisch isolierter Netzwerkbereich.'
        }
      ],
      { siteUrl: 'https://blog.obivan.org', buildDate: '2026-08-22' }
    );

    expect(markdown).toContain('# Zero-Downtime Deployments mit Docker Compose {#post-2026-08-18-zero-downtime-mit-compose}');
    expect(markdown).toContain('[Online lesen](https://blog.obivan.org/posts/2026-08-18-zero-downtime-mit-compose)');
    expect(markdown).toContain('# Glossar {#glossar}');
    expect(markdown).toContain('### VPC {#glossary-vpc}');
    expect(markdown).toContain('**Virtual Private Cloud**');
  });

  it('mounts the ebook outside the read-only post-assets volume', () => {
    const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.prod.yml'), 'utf8');

    expect(compose).toContain('blog-post-assets:/app/assets/posts:ro');
    expect(compose).toContain('blog-ebook:/app/assets/downloads:ro');
    expect(compose).not.toContain('blog-ebook:/app/assets/posts/downloads:ro');
  });
});
