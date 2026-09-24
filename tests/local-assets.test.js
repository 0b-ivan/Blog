const {
  articleImagePolicyViolations,
  cleanTarget,
  collectMarkdownImages
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

  it('normalizes query strings and fragments before path checks', () => {
    expect(cleanTarget('/assets/posts/demo/image.png?v=2#focus')).toBe(
      '/assets/posts/demo/image.png'
    );
  });
});
