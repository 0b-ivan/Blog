const MarkdownIt = require('markdown-it');
const {
  IMAGE_SIZE_PRESETS,
  installArticleImageSizing,
  parseImageSizeAttributes
} = require('../lib/article-image-sizing');

describe('article image sizing', () => {
  it('supports named size presets', () => {
    expect(IMAGE_SIZE_PRESETS).toEqual({
      small: 35,
      medium: 55,
      large: 75,
      full: 100
    });

    expect(parseImageSizeAttributes('{size=medium}')).toMatchObject({
      width: 55,
      size: 'medium',
      rest: ''
    });
  });

  it('supports explicit percentage widths from 10 to 100 percent', () => {
    expect(parseImageSizeAttributes('{width=42%}')).toMatchObject({
      width: 42,
      size: '',
      rest: ''
    });
    expect(parseImageSizeAttributes('{width=9%}')).toBe(null);
    expect(parseImageSizeAttributes('{width=101%}')).toBe(null);
  });

  it('renders sizing metadata on Markdown images without exposing the attribute text', () => {
    const md = new MarkdownIt({ html: false });
    installArticleImageSizing(md);

    const html = md.render('![Pac-Man](/assets/posts/pac-man/01.jpg){size=medium}\n');

    expect(html).toContain('class="article-image article-image--medium"');
    expect(html).toContain('data-image-size="medium"');
    expect(html).toContain('data-image-width="55"');
    expect(html).toContain('style="width:55%;max-width:100%;height:auto;"');
    expect(html).not.toContain('{size=medium}');
  });

  it('renders arbitrary percentage widths', () => {
    const md = new MarkdownIt({ html: false });
    installArticleImageSizing(md);

    const html = md.render('![Pac-Man](/assets/posts/pac-man/01.jpg){width=42%}\n');

    expect(html).toContain('data-image-width="42"');
    expect(html).toContain('style="width:42%;max-width:100%;height:auto;"');
    expect(html).not.toContain('{width=42%}');
  });

  it('leaves unknown sizing syntax visible instead of silently changing it', () => {
    const md = new MarkdownIt({ html: false });
    installArticleImageSizing(md);

    const html = md.render('![Pac-Man](/assets/posts/pac-man/01.jpg){size=giant}\n');

    expect(html).toContain('{size=giant}');
    expect(html).not.toContain('data-image-width');
  });
});
