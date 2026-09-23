const fs = require('node:fs');
const path = require('node:path');

describe('article hero cover readability', () => {
  it('adds the title scrim only for heroes that have a real cover', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'article-metrics.css'),
      'utf8'
    );

    expect(css).toContain('.article-hero--has-cover .article-title::before');
    expect(css).toContain('rgba(4, 13, 20, 0.42)');
    expect(css).toContain('rgba(4, 13, 20, 0.48)');
    expect(css).toContain('.article-hero--has-cover .article-hero__chrome');
    expect(css).toContain('.article-hero--has-cover .article-meta::before');
    expect(css).toContain('rgba(4, 13, 20, 0.76)');
    expect(css).not.toContain('.article-hero .article-title::before');
  });
});
