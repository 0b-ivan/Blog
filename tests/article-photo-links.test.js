const {
  assetScopeFromPost,
  collectMarkdownImages,
  commonsSourceFromRemoteImage,
  planRemoteImages
} = require('../scripts/materialize-external-images');

describe('external article image materializer', () => {
  it('derives the asset scope from a dated post filename', () => {
    expect(assetScopeFromPost('posts/2026-09-26-mein-artikel.md')).toBe('mein-artikel');
  });

  it('recognizes raw and thumbnail Wikimedia Commons URLs', () => {
    expect(
      commonsSourceFromRemoteImage(
        'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg'
      )
    ).toEqual({
      fileTitle: 'File:Example.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Example.jpg'
    });

    expect(
      commonsSourceFromRemoteImage(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/1200px-Example.jpg'
      )
    ).toEqual({
      fileTitle: 'File:Example.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Example.jpg'
    });
  });

  it('ignores image-looking Markdown inside fenced code blocks', () => {
    const markdown = [
      '~~~md',
      '![Nicht echt](https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg)',
      '~~~',
      '',
      '![Echt](https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg)'
    ].join('\n');

    expect(collectMarkdownImages(markdown)).toHaveLength(1);
  });

  it('keeps a Commons image online for authoring while creating a local materialization manifest', () => {
    const markdown = [
      '# Demo',
      '',
      '![Beispielbild](https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg)'
    ].join('\n');

    const result = planRemoteImages(markdown, 'posts/2026-09-26-demo.md');

    expect(result.changed).toBe(true);
    expect(result.manifestPath).toBe('media/photos/demo.json');
    expect(result.manifest.photos).toHaveLength(1);

    const photo = result.manifest.photos[0];
    expect(photo.provider).toBe('wikimedia-commons');
    expect(photo.source).toBe('https://commons.wikimedia.org/wiki/File:Example.jpg');
    expect(photo.output).toMatch(/^assets\/posts\/demo\/01-beispielbild\.jpg$/);
    expect(photo.source_id).toMatch(/^demo-commons-[a-f0-9]{10}$/);

    expect(result.markdown).toContain(
      '![Beispielbild](https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg)'
    );
    expect(result.markdown).toContain(
      `[Wikimedia Commons](/sources.html#${photo.source_id})`
    );
    expect(result.markdown).not.toContain(`](/${photo.output})`);
  });


  it('preserves image sizing attributes while normalizing the authoring URL', () => {
    const markdown = '![Beispielbild](https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg){width=42%}\n';

    const result = planRemoteImages(markdown, 'posts/2026-09-26-demo.md');
    const photo = result.manifest.photos[0];

    expect(result.markdown).toContain(
      '![Beispielbild](https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg){width=42%}'
    );
    expect(result.markdown).toContain(
      `[Wikimedia Commons](/sources.html#${photo.source_id})`
    );
  });


  it('restores an existing manifest-managed local path to a remote authoring URL', () => {
    const manifest = {
      version: 1,
      post: 'posts/2026-09-26-demo.md',
      photos: [{
        source_id: 'demo-commons-example',
        provider: 'wikimedia-commons',
        source: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
        output: 'assets/posts/demo/01-example.jpg',
        alt: 'Beispielbild',
        width: 1400
      }]
    };
    const markdown = '![Beispielbild](/assets/posts/demo/01-example.jpg){size=medium}\n';

    const result = planRemoteImages(markdown, 'posts/2026-09-26-demo.md', manifest);

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain(
      '![Beispielbild](https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg){size=medium}'
    );
    expect(result.markdown).toContain(
      '[Wikimedia Commons](/sources.html#demo-commons-example)'
    );
  });

  it('leaves unmanaged local images alone', () => {
    const markdown = '![Lokal](/assets/posts/demo/01-lokal.jpg)\n';
    const result = planRemoteImages(markdown, 'posts/2026-09-26-demo.md');

    expect(result.changed).toBe(false);
    expect(result.manifest.photos).toEqual([]);
    expect(result.markdown).toBe(markdown);
  });

  it('rejects unsupported providers instead of downloading them without license metadata', () => {
    const markdown = '![Extern](https://example.com/image.jpg)\n';

    expect(() => planRemoteImages(markdown, 'posts/2026-09-26-demo.md')).toThrow(
      /only Wikimedia Commons URLs are auto-materialized/
    );
  });

  it('requires alt text before materializing a remote image', () => {
    const markdown = '![](https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg)\n';

    expect(() => planRemoteImages(markdown, 'posts/2026-09-26-demo.md')).toThrow(
      /needs alt text/
    );
  });
});
