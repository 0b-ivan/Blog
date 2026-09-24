const {
  articleImagePolicyViolations,
  cleanTarget,
  collectMarkdownImages,
  imageContentViolation
} = require('../scripts/check-local-assets');

describe('article image policy', () => {
  it('accepts a local article image with descriptive alt text', () => {
    expect(articleImagePolicyViolations({
      alt: 'Puck-Man-Arcade-Automat',
      target: '/assets/posts/pac-man-puck-man/01-puck-man-cabinet.jpg'
    })).toEqual([]);
  });

  it('rejects external image hotlinks', () => {
    expect(articleImagePolicyViolations({
      alt: 'Arcade cabinet',
      target: 'https://example.test/cabinet.jpg'
    })).toContain(
      'article images must be stored locally under /assets/posts/; external/data targets are not allowed'
    );
  });

  it('requires root-relative article asset paths and alt text', () => {
    const violations = articleImagePolicyViolations({
      alt: '',
      target: 'assets/posts/pac-man/image.png'
    });

    expect(violations).toContain('missing alt text');
    expect(violations).toContain(
      'article images must use a root-relative /assets/posts/ path'
    );
  });

  it('ignores markdown image examples inside fenced code blocks', () => {
    const markdown = [
      '![Real](/assets/posts/demo/01-real.png)',
      '',
      '```md',
      '![Example](https://example.test/not-a-real-article-image.png)',
      '```'
    ].join('\n');

    expect(collectMarkdownImages(markdown)).toEqual([{
      alt: 'Real',
      target: '/assets/posts/demo/01-real.png'
    }]);
  });

  it('rejects empty and malformed raster images', () => {
    expect(imageContentViolation('/assets/posts/demo/empty.jpg', Buffer.alloc(0))).toBe(
      'image file is empty'
    );
    expect(imageContentViolation('/assets/posts/demo/bad.jpg', Buffer.from('not-a-jpeg'))).toBe(
      'invalid JPEG signature'
    );
    expect(imageContentViolation(
      '/assets/posts/demo/good.jpg',
      Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00])
    )).toBeNull();
  });

  it('validates PNG and SVG signatures', () => {
    expect(imageContentViolation(
      '/assets/posts/demo/good.png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )).toBeNull();
    expect(imageContentViolation(
      '/assets/posts/demo/good.svg',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    )).toBeNull();
  });

  it('normalizes query strings and fragments before path checks', () => {
    expect(cleanTarget('/assets/posts/demo/image.png?v=2#focus')).toBe(
      '/assets/posts/demo/image.png'
    );
  });
});
