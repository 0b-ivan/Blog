const {
  resolveManagedImageHtml,
  resolveManagedImageSource
} = require('../lib/article-photo-resolver');

describe('managed article photo resolver', () => {
  const manifest = {
    version: 1,
    post: 'posts/2026-09-26-demo.md',
    photos: [{
      source_id: 'demo-commons-example',
      provider: 'wikimedia-commons',
      source: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      output: 'assets/posts/demo/01-example.jpg',
      alt: 'Example',
      width: 1400
    }]
  };

  it('maps a stable Commons authoring URL to the local runtime asset', () => {
    expect(resolveManagedImageSource(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg',
      manifest
    )).toBe('/assets/posts/demo/01-example.jpg');
  });

  it('rewrites only managed image src attributes in rendered HTML', () => {
    const html = [
      '<p><img src="https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg" alt="Example"></p>',
      '<p><a href="https://commons.wikimedia.org/wiki/File:Example.jpg">Quelle</a></p>'
    ].join('');

    const resolved = resolveManagedImageHtml(html, manifest);

    expect(resolved).toContain('src="/assets/posts/demo/01-example.jpg"');
    expect(resolved).toContain('href="https://commons.wikimedia.org/wiki/File:Example.jpg"');
  });

  it('does not turn arbitrary external images into local assets', () => {
    const html = '<img src="https://example.test/image.jpg" alt="External">';

    expect(resolveManagedImageHtml(html, manifest)).toBe(html);
  });
});
