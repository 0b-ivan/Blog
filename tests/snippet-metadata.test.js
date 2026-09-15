const MarkdownIt = require('markdown-it');
const { resolveSnippets, installSnippetRenderer } = require('../lib/snippets');

const legacy = [{ post: 'demo', path: 'demo/run.sh', title: 'Old', usage: 'Old purpose', language: 'bash' }];
const markdown = '[Link title](/snippets/demo/run.sh "snippet:sh:2-3")';

function resolve(data = {}, extra = {}) {
  return resolveSnippets({ slug: 'demo', title: 'Article', markdown, legacy, data, ...extra });
}

describe('shared snippet metadata', () => {
  it('overrides each field and allows an intentionally empty description', () => {
    expect(resolve({ snippets: [{ file: 'run.sh', title: 'New', description: '' }] })[0]).toMatchObject({
      title: 'New', description: '', usage: '', language: 'bash', type: 'Shellskript', path: 'demo/run.sh', postTitle: 'Article'
    });
    expect(resolve()[0]).toMatchObject({ title: 'Old', description: 'Old purpose' });
    expect(resolve({}, { legacy: [] })[0]).toMatchObject({ title: 'Link title', language: 'sh', type: 'Shellskript' });
  });

  it('supports frontmatter-only entries and conservative format fallbacks', () => {
    expect(resolve({ snippets: [{ file: 'config.yml' }] }, { legacy: [], markdown: '' })[0]).toMatchObject({
      title: 'config.yml', language: 'yaml', type: 'YAML', description: ''
    });
  });

  it.each([
    { snippets: {} },
    { snippets: [{ file: '../secret' }] },
    { snippets: [{ file: '/secret' }] },
    { snippets: [{ file: '%2e%2e/secret' }] },
    { snippets: [{ file: 'run.sh' }, { file: 'run.sh' }] },
    { snippets: [{ file: 'run.sh', title: false }] },
    { snippets: [{ file: 'run.sh', description: null }] },
    { snippets: [{ file: 'run.sh', titel: 'Typo' }] }
  ])('rejects invalid metadata %j', (data) => {
    expect(() => resolve(data)).toThrow();
  });

  it('rejects missing files when validating and ignores code-fenced links', () => {
    expect(() => resolve({}, { snippetsDir: __dirname })).toThrow();
    expect(resolve({}, { legacy: [], markdown: '```markdown\n' + markdown + '\n```' })).toEqual([]);
  });

  it('embeds the exact resolved metadata with escaped HTML and preserves the range', () => {
    const snippets = resolve({ snippets: [{ file: 'run.sh', title: '<img src=x onerror=alert(1)>', description: 'A "quote" & text' }] });
    const md = new MarkdownIt();
    installSnippetRenderer(md);
    const html = md.render(markdown, { snippets });
    expect(html).toContain('title="snippet:sh:2-3"');
    expect(html).not.toContain('<img');
    const attribute = html.match(/data-snippet="([^"]+)"/)[1];
    expect(JSON.parse(require('entities').decodeHTML(attribute))).toEqual(snippets[0]);
  });
});
