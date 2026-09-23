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

  it('applies subtle scroll motion only to the shared mobile cover layer', () => {
    const shellCss = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'css', 'styles.css'),
      'utf8'
    );
    const motionSource = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'article-hero-motion.js'),
      'utf8'
    );

    expect(shellCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.terminal-post--article::before\s*\{[\s\S]*?perspective\(900px\)/);
    expect(shellCss).toContain('blur(var(--article-cover-motion-blur))');
    expect(shellCss).toContain('brightness(var(--article-cover-motion-brightness))');
    expect(shellCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.terminal-post--article::before\s*\{[\s\S]*?transform:\s*none;/);

    expect(motionSource).toContain("matchMedia('(max-width: 620px)')");
    expect(motionSource).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(motionSource).toContain('requestAnimationFrame(update)');
    expect(motionSource).toContain("'--article-cover-motion-y'");
    expect(motionSource).toContain("'--article-cover-motion-blur'");
    expect(motionSource).toContain("'--article-cover-motion-brightness'");
    expect(motionSource).toContain('const y = 10 * progress');
    expect(motionSource).toContain('const blur = 0.2 + (0.9 * progress)');
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
    expect(articleCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero__excerpt\s*\{[\s\S]*?-webkit-line-clamp:\s*unset;/);
    expect(articleCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero__excerpt\s*\{[\s\S]*?mask-image:\s*none;/);
    expect(articleCss).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.article-hero--has-cover::after\s*\{[\s\S]*?backdrop-filter:\s*blur\(2\.4px\)/);
    expect(articleCss).toContain('rgba(236, 248, 245, 0.96)');
  });
});
