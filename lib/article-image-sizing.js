const IMAGE_SIZE_PRESETS = Object.freeze({
  small: 35,
  medium: 55,
  large: 75,
  full: 100
});

function parseImageSizeAttributes(value) {
  const source = String(value || '');
  const match = source.match(/^\{\s*(size|width)\s*=\s*([^}\s]+)\s*\}/i);
  if (!match) return null;

  const key = match[1].toLowerCase();
  const rawValue = match[2].toLowerCase();
  let width;
  let size = '';

  if (key === 'size') {
    if (!Object.prototype.hasOwnProperty.call(IMAGE_SIZE_PRESETS, rawValue)) {
      return null;
    }
    size = rawValue;
    width = IMAGE_SIZE_PRESETS[rawValue];
  } else {
    const widthMatch = rawValue.match(/^(\d{1,3})%$/);
    if (!widthMatch) return null;
    width = Number(widthMatch[1]);
    if (!Number.isInteger(width) || width < 10 || width > 100) return null;
  }

  return {
    width,
    size,
    consumed: match[0].length,
    rest: source.slice(match[0].length)
  };
}

function installArticleImageSizing(md) {
  md.core.ruler.after('inline', 'article_image_sizing', (state) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== 'inline' || !Array.isArray(blockToken.children)) continue;

      const children = blockToken.children;
      for (let index = 0; index < children.length - 1; index += 1) {
        const image = children[index];
        const attributes = children[index + 1];

        if (image.type !== 'image' || attributes.type !== 'text') continue;

        const parsed = parseImageSizeAttributes(attributes.content);
        if (!parsed) continue;

        image.attrJoin('class', 'article-image');
        if (parsed.size) {
          image.attrJoin('class', `article-image--${parsed.size}`);
          image.attrSet('data-image-size', parsed.size);
        }
        image.attrSet('data-image-width', String(parsed.width));
        image.attrSet(
          'style',
          `width:${parsed.width}%;max-width:100%;height:auto;`
        );

        attributes.content = parsed.rest;
      }
    }
  });
}

module.exports = {
  IMAGE_SIZE_PRESETS,
  installArticleImageSizing,
  parseImageSizeAttributes
};
