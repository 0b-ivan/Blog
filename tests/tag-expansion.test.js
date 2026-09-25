const fs = require('node:fs');
const path = require('node:path');

describe('expandable article tags', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  it('keeps hidden tag chips out of layout until the toggle reveals them', () => {
    const rootCss = read('styles.css');
    const assetCss = read('assets/css/styles.css');

    for (const css of [rootCss, assetCss]) {
      expect(css).toMatch(/\.tag-chip\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/);
    }
  });

  it('preserves and toggles the hidden state when tag chips become links', () => {
    const server = read('server.js');
    const navigation = read('assets/tag-navigation.js');
    const analytics = read('assets/article-analytics.js');

    expect(server).toContain('data-extra-tag hidden');
    expect(navigation).toContain('link.hidden = chip.hidden');
    expect(analytics).toContain('tag.hidden = expanded');
    expect(analytics).toContain("tagToggle.setAttribute('aria-expanded', String(!expanded))");
  });
});
