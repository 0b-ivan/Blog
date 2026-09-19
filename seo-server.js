const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const legacy = require('./server');
const enhanced = require('./enhanced-server');
const privacy = require('./privacy-server');

const port = process.env.PORT || 8080;
const root = __dirname;
const postsDir = process.env.POSTS_DIR || path.join(root, 'posts');
const archiveDir = process.env.ARCHIVE_DIR || path.join(root, 'archive');
const siteUrl = legacy.getSiteUrl();
const SEO_CACHE_TTL_MS = 1000;
const seoPostCache = new Map();

const STATIC_DESCRIPTIONS = new Map([
  ['/', 'Praxisnotizen zu AWS, Linux, Self-Hosting, Security und Automation.'],
  ['/about', 'Über Kernel Notes und die technischen Themen hinter dem Blog.'],
  ['/snippets/', 'Wiederverwendbare Code- und Konfigurations-Snippets aus der Praxis.'],
  ['/glossary', 'Glossar für Fachbegriffe aus Cloud, Linux, Security, DevOps und Self-Hosting.'],
  ['/sources', 'Zentrale Quellen und Referenzen der Kernel-Notes-Artikel.'],
  ['/status', 'Öffentlicher Betriebsstatus der Kubernetes-Infrastruktur hinter Kernel Notes.'],
  ['/archive', 'Archivierte Kernel-Notes-Artikel mit dauerhaft lesbaren historischen Inhalten.']
]);

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(value) {
  return decodeBasicEntities(String(value || '').replace(/<[^>]+>/g, '').trim());
}

function normalizeCanonicalPath(requestPath) {
  const pathname = String(requestPath || '/').split('?')[0] || '/';
  const aliases = new Map([
    ['/index.html', '/'],
    ['/about.html', '/about'],
    ['/grep.html', '/grep'],
    ['/impressum.html', '/impressum'],
    ['/datenschutz.html', '/datenschutz'],
    ['/sources.html', '/sources'],
    ['/status.html', '/status'],
    ['/snippets', '/snippets/'],
    ['/snippets/index.html', '/snippets/']
  ]);
  return aliases.get(pathname) || pathname;
}

function absoluteUrl(requestPath) {
  return `${siteUrl}${normalizeCanonicalPath(requestPath)}`;
}

function normalizeDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
}

function excerptFromContent(content) {
  return legacy.excerptFromBody(String(content || ''));
}

async function loadSeoPosts(directory, status) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
  return Promise.all(files.map(async (file) => {
    const raw = await fs.readFile(path.join(directory, file.name), 'utf8');
    const parsed = matter(raw);
    const recovered = legacy.recoverMetadata(raw, parsed);
    const slug = legacy.slugify(file.name);
    const inferredDate = legacy.inferDateFromSlug(slug);
    const datePublished = recovered.data.published_at
      || recovered.data.created_at
      || recovered.data.date
      || inferredDate;
    const dateModified = recovered.data.updated_at || datePublished;

    return {
      slug,
      status,
      title: String(recovered.data.title || slug),
      description: String(recovered.data.excerpt || excerptFromContent(recovered.content)),
      author: String(recovered.data.author || process.env.SEO_DEFAULT_AUTHOR || 'Ivan Babayev'),
      category: String(recovered.data.category || 'IT'),
      tags: legacy.normalizeTags(recovered.data.tags),
      datePublished: normalizeDate(datePublished),
      dateModified: normalizeDate(dateModified)
    };
  }));
}

async function readSeoPosts(directory, status) {
  const key = `${path.resolve(directory)}:${status}`;
  const now = Date.now();
  const cached = seoPostCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.posts;
  }
  const posts = await loadSeoPosts(directory, status);
  seoPostCache.set(key, { posts, expiresAt: now + SEO_CACHE_TTL_MS });
  return posts;
}

function resolveSeoPost(posts, requestedSlug) {
  return legacy.resolvePostBySlug(posts, requestedSlug);
}

function articleContext(post, canonicalPath) {
  return {
    canonicalPath,
    title: post.title,
    description: post.description,
    type: 'article',
    article: post
  };
}

async function historyCanonicalPath(requestPath) {
  const match = String(requestPath || '').match(/^\/history\/([^/]+)(?:\/v\d+)?$/);
  if (!match) {
    return null;
  }
  const slug = await enhanced.resolveHistorySlug(match[1]);
  const manifest = slug ? await enhanced.readManifest(slug) : null;
  if (!slug || !manifest) {
    return null;
  }
  return manifest.status === 'archived' ? `/archive/${slug}` : `/posts/${slug}`;
}

async function seoContextForRequest(requestPath) {
  const canonicalPath = normalizeCanonicalPath(requestPath);

  const postMatch = canonicalPath.match(/^\/posts\/([^/]+)$/);
  if (postMatch) {
    const posts = await readSeoPosts(postsDir, 'active');
    const post = resolveSeoPost(posts, postMatch[1]);
    return post ? articleContext(post, `/posts/${post.slug}`) : { canonicalPath };
  }

  const archiveMatch = canonicalPath.match(/^\/archive\/([^/]+)$/);
  if (archiveMatch) {
    const posts = await readSeoPosts(archiveDir, 'archived');
    const post = resolveSeoPost(posts, archiveMatch[1]);
    return post ? articleContext(post, `/archive/${post.slug}`) : { canonicalPath };
  }

  if (canonicalPath.startsWith('/history/')) {
    return {
      canonicalPath: await historyCanonicalPath(canonicalPath) || canonicalPath,
      robots: 'noindex,follow'
    };
  }

  if (canonicalPath.startsWith('/tags/')) {
    return { canonicalPath, robots: 'noindex,follow' };
  }

  if (canonicalPath === '/grep' || canonicalPath.startsWith('/search')) {
    return { canonicalPath, robots: 'noindex,follow' };
  }

  if (canonicalPath === '/knowledge' || canonicalPath === '/knowledge/') {
    return { canonicalPath: '/knowledge', robots: 'noindex,follow' };
  }

  return {
    canonicalPath,
    description: STATIC_DESCRIPTIONS.get(canonicalPath) || ''
  };
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).replace(/\s*\|\s*Kernel Notes\s*$/i, '') : 'Kernel Notes';
}

function extractDescription(html) {
  const match = String(html || '').match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || String(html || '').match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? decodeBasicEntities(match[1]) : '';
}

function articleJsonLd(article, canonical) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.description,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical
    },
    author: {
      '@type': 'Person',
      name: article.author
    },
    publisher: {
      '@type': 'Organization',
      name: 'Kernel Notes',
      url: `${siteUrl}/`
    },
    isAccessibleForFree: true
  };

  if (article.datePublished) payload.datePublished = article.datePublished;
  if (article.dateModified) payload.dateModified = article.dateModified;
  if (article.category) payload.articleSection = article.category;
  if (article.tags.length) payload.keywords = article.tags;

  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function removeManagedSeo(html) {
  return String(html || '')
    .replace(/\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/\s*<meta\b[^>]*(?:name=["']robots["']|property=["']og:[^"']+["']|name=["']twitter:card["'])[^>]*>/gi, '')
    .replace(/\s*<script\b[^>]*data-kernel-seo[^>]*>[\s\S]*?<\/script>/gi, '');
}

function injectSeoHead(html, context = {}) {
  if (!/(?:<!doctype html|<html\b)/i.test(String(html || ''))) {
    return html;
  }

  const clean = removeManagedSeo(html);
  const canonicalPath = normalizeCanonicalPath(context.canonicalPath || '/');
  const canonical = absoluteUrl(canonicalPath);
  const title = String(context.title || extractTitle(clean) || 'Kernel Notes');
  const description = String(context.description || extractDescription(clean) || STATIC_DESCRIPTIONS.get(canonicalPath) || 'Kernel Notes – IT-Blog über Cloud, Linux, Security und Automation.');
  const type = context.type === 'article' ? 'article' : 'website';

  const lines = [
    `    <link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    context.robots ? `    <meta name="robots" content="${escapeAttribute(context.robots)}" />` : '',
    `    <meta property="og:type" content="${type}" />`,
    `    <meta property="og:title" content="${escapeAttribute(title)}" />`,
    `    <meta property="og:description" content="${escapeAttribute(description)}" />`,
    `    <meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    '    <meta property="og:site_name" content="Kernel Notes" />',
    '    <meta name="twitter:card" content="summary" />'
  ].filter(Boolean);

  if (context.article) {
    lines.push(`    <script type="application/ld+json" data-kernel-seo>${articleJsonLd(context.article, canonical)}</script>`);
  }

  return clean.replace('</head>', `${lines.join('\n')}\n  </head>`);
}

function sitemapEntry(requestPath, lastModified = '') {
  const lastmod = normalizeDate(lastModified);
  return `  <url>\n    <loc>${legacy.escapeXml(absoluteUrl(requestPath))}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
}

async function generateSitemapXml() {
  const activePosts = await readSeoPosts(postsDir, 'active');
  const archivedPosts = await readSeoPosts(archiveDir, 'archived');
  const staticPaths = ['/', '/about', '/snippets/', '/glossary', '/sources', '/status', '/archive'];
  const entries = [
    ...staticPaths.map((requestPath) => sitemapEntry(requestPath)),
    ...activePosts.map((post) => sitemapEntry(`/posts/${post.slug}`, post.dateModified || post.datePublished)),
    ...archivedPosts.map((post) => sitemapEntry(`/archive/${post.slug}`, post.dateModified || post.datePublished))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(robotsTxt());
  });

  app.get('/sitemap.xml', async (_req, res) => {
    try {
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.send(await generateSitemapXml());
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not generate sitemap');
    }
  });

  const redirects = new Map([
    ['/index.html', '/'],
    ['/about.html', '/about'],
    ['/impressum.html', '/impressum'],
    ['/datenschutz.html', '/datenschutz'],
    ['/sources.html', '/sources'],
    ['/status.html', '/status'],
    ['/grep.html', '/grep'],
    ['/snippets/index.html', '/snippets/']
  ]);

  app.use((req, res, next) => {
    const target = redirects.get(req.path);
    if (target) {
      res.redirect(301, target);
      return;
    }
    next();
  });

  app.use(async (req, res, next) => {
    try {
      const context = await seoContextForRequest(req.path);
      if (context.robots) {
        res.setHeader('X-Robots-Tag', context.robots);
      }

      const originalSend = res.send.bind(res);
      res.send = (body) => {
        if (typeof body === 'string' && /(?:<!doctype html|<html\b)/i.test(body)) {
          return originalSend(injectSeoHead(body, context));
        }
        return originalSend(body);
      };
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use(privacy.createApp());
  return app;
}

function startServer() {
  return createApp().listen(port, () => {
    console.log(`kernel-notes listening on :${port} with SEO, privacy and history support`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  STATIC_DESCRIPTIONS,
  normalizeCanonicalPath,
  normalizeDate,
  readSeoPosts,
  resolveSeoPost,
  seoContextForRequest,
  articleJsonLd,
  injectSeoHead,
  generateSitemapXml,
  robotsTxt,
  createApp,
  startServer
};
