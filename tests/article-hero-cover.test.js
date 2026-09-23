const fs = require('node:fs');
const path = require('node:path');

describe('article hero cover readability', () => {
  it('blends real covers through the shared terminal surface instead of separate hero scrims', () => {
    const articleCss = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'article-metrics.css'),
      'utf8'
    );
    const shellCss = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'styles.css'),
      'utf8'
    );

    expect(shellCss).toContain('.terminal-post--article::before');
    expect(shellCss).toContain('var(--article-cover-overlay)');
    expect(shellCss).toContain('var(--article-cover-image)');
    expect(shellCss).toContain('mask-image: linear-gradient(');
    expect(shellCss).toContain('.terminal-content {');
    expect(shellCss).toMatch(/\.terminal-content\s*\{[\s\S]*?background:\s*transparent;/);

    expect(articleCss).toMatch(/\.article-hero\s*\{[\s\S]*?background:\s*transparent;/);
    expect(articleCss).toMatch(/\.article-hero--has-cover \.article-title::before\s*\{[\s\S]*?display:\s*none;/);
    expect(articleCss).toMatch(/\.article-hero--has-cover \.article-meta::before\s*\{[\s\S]*?display:\s*none;/);
    expect(articleCss).toMatch(/\.article-hero--has-cover \.article-hero__chrome\s*\{[\s\S]*?background:\s*transparent;/);
    expect(articleCss).not.toContain('rgba(4, 13, 20, 0.42)');
    expect(articleCss).not.toContain('rgba(4, 13, 20, 0.48)');
    expect(articleCss).not.toContain('rgba(4, 13, 20, 0.76)');
  });

  it('keeps the mobile cover inside the hero and gives credits their own line', () => {
    const articleCss = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'article-metrics.css'),
      'utf8'
    );
    const shellCss = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'styles.css'),
      'utf8'
    );

    expect(shellCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.terminal-post--article::before\s*\{[\s\S]*?display:\s*block;/);
    expect(shellCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.terminal-post--article::before\s*\{[\s\S]*?var\(--article-cover-image\)/);
    expect(shellCss).toContain('var(--terminal-surface) 100%');
    expect(articleCss).not.toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero--has-cover\s*\{[\s\S]*?var\(--article-cover-image\)/);
    expect(articleCss).toMatch(/\.article-hero__credit\s*\{[\s\S]*?position:\s*static;[\s\S]*?text-align:\s*right;/);
    expect(articleCss).toContain('font-size: clamp(1.55rem, 7vw, 2.05rem);');
    expect(articleCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero__excerpt\s*\{[\s\S]*?opacity:\s*1;/);
    expect(articleCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero__excerpt\s*\{[\s\S]*?-webkit-mask-image:\s*linear-gradient\(/);
    expect(articleCss).toContain('rgba(225, 244, 239, 0.92)');
  });
});
