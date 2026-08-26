const path = require('node:path');
const {
  readSeoPosts,
  injectSeoHead,
  generateSitemapXml,
  robotsTxt
} = require('../seo-server');

const root = path.join(__dirname, '..');
const postsDir = process.env.POSTS_DIR || path.join(root, 'posts');
const archiveDir = process.env.ARCHIVE_DIR || path.join(root, 'archive');

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function duplicateValues(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const value = String(selector(item) || '').trim().toLocaleLowerCase('de');
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

async function main() {
  const errors = [];
  const active = await readSeoPosts(postsDir, 'active');
  const archived = await readSeoPosts(archiveDir, 'archived');
  const all = [...active, ...archived];

  for (const post of all) {
    const prefix = `${post.status}:${post.slug}`;
    addError(errors, post.title && post.title !== post.slug, `${prefix}: title missing`);
    addError(errors, post.description.length >= 40, `${prefix}: excerpt/description should contain at least 40 characters`);
    addError(errors, Boolean(post.datePublished), `${prefix}: valid published date missing`);
    addError(errors, Boolean(post.dateModified), `${prefix}: valid modified date missing`);
    addError(errors, Boolean(post.author), `${prefix}: author missing`);
  }

  for (const duplicate of duplicateValues(active, (post) => post.slug)) {
    errors.push(`active posts: duplicate slug '${duplicate}'`);
  }
  for (const duplicate of duplicateValues(active, (post) => post.title)) {
    errors.push(`active posts: duplicate title '${duplicate}'`);
  }

  const sitemap = await generateSitemapXml();
  for (const post of active) {
    addError(errors, sitemap.includes(`/posts/${post.slug}</loc>`), `sitemap: active post missing '${post.slug}'`);
  }
  for (const post of archived) {
    addError(errors, sitemap.includes(`/archive/${post.slug}</loc>`), `sitemap: archived post missing '${post.slug}'`);
  }
  addError(errors, !sitemap.includes('/history/'), 'sitemap: history URLs must not be indexed');
  addError(errors, !sitemap.includes('/tags/'), 'sitemap: tag URLs must not be indexed');
  addError(errors, !sitemap.includes('/grep'), 'sitemap: search URLs must not be indexed');

  const sampleHtml = '<!doctype html><html><head><title>Test | Kernel Notes</title><meta name="description" content="Test description"></head><body></body></html>';
  const indexed = injectSeoHead(sampleHtml, { canonicalPath: '/posts/test', title: 'Test', description: 'Test description' });
  addError(errors, indexed.includes('<link rel="canonical" href="https://blog.obivan.org/posts/test"'), 'head: canonical missing');
  addError(errors, indexed.includes('property="og:title" content="Test"'), 'head: Open Graph title missing');

  const noindex = injectSeoHead(sampleHtml, { canonicalPath: '/history/test/v1', robots: 'noindex,follow' });
  addError(errors, noindex.includes('name="robots" content="noindex,follow"'), 'head: noindex directive missing');

  addError(errors, robotsTxt().includes('Sitemap: https://blog.obivan.org/sitemap.xml'), 'robots.txt: sitemap reference missing');

  if (errors.length) {
    console.error(`SEO validation failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`SEO validation passed: ${active.length} active, ${archived.length} archived articles.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
