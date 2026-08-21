const {
  extractResourcePaths,
  resourceRepoPath,
  versionedResourceUrl,
  rewriteResourceLinks,
  frontmatterValue,
  snapshotHash
} = require('../scripts/build-post-history');

describe('article history builder', () => {
  it('finds article snippets and post images', () => {
    const markdown = [
      '[Run](/snippets/my-post/run.sh "snippet:bash")',
      '![Screenshot](/assets/posts/my-post/screen.png)',
      '[External](https://example.com/file.txt)'
    ].join('\n');

    expect(extractResourcePaths(markdown)).toEqual([
      '/assets/posts/my-post/screen.png',
      '/snippets/my-post/run.sh'
    ]);
  });

  it('rewrites historical resources into immutable snapshot URLs', () => {
    const markdown = '[Run](/snippets/demo/run.sh "snippet:bash")\n![Img](/assets/posts/demo/a.svg)';
    const rewritten = rewriteResourceLinks(markdown, '2026-08-21-demo', 3);

    expect(rewritten).toContain('/history-assets/2026-08-21-demo/v3/resources/snippets/demo/run.sh');
    expect(rewritten).toContain('/history-assets/2026-08-21-demo/v3/resources/assets/posts/demo/a.svg');
  });

  it('normalizes repository resource paths and reads simple frontmatter', () => {
    expect(resourceRepoPath('/snippets/demo/a%20b.sh')).toBe('snippets/demo/a b.sh');
    expect(versionedResourceUrl('slug', 2, '/snippets/x.sh')).toBe('/history-assets/slug/v2/resources/snippets/x.sh');
    expect(frontmatterValue('---\ntitle: "Hello"\n---\nBody', 'title')).toBe('Hello');
  });

  it('changes snapshot hashes when referenced resources change', () => {
    const first = snapshotHash('same post', [{ url: '/snippets/a.sh', content: Buffer.from('one') }]);
    const second = snapshotHash('same post', [{ url: '/snippets/a.sh', content: Buffer.from('two') }]);
    expect(first).not.toBe(second);
  });
});
