const { resolveSnippets, installSnippetRenderer } = require('./lib/snippets');
const express = require('express');
const fs = require('node:fs/promises');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js/lib/common');
const mdFootnote = require('markdown-it-footnote');
const mdContainer = require('markdown-it-container');
const mdAbbr = require('markdown-it-abbr');
const {
  canonicalGlossaryKey,
  glossarySlug,
  renderGlossaryPage,
  withGlossaryDefinitions
} = require('./lib/glossary');
const { countWords, calculateReadingTime } = require('./lib/reading-time');

const port = process.env.PORT || 8080;
const root = __dirname;
const DEFAULT_SITE_URL = 'https://blog.obivan.org';
const DEFAULT_POSTS_CACHE_TTL_MS = 1000;
const MAX_VISIBLE_TAGS = 10;
const postsCache = new Map();

function getPostsDir(explicitPostsDir) {
  return explicitPostsDir || process.env.POSTS_DIR || path.join(root, 'posts');
}

function getSiteUrl(explicitSiteUrl) {
  const configured = String(explicitSiteUrl || process.env.SITE_URL || DEFAULT_SITE_URL).trim();
  const normalized = configured.replace(/\/+$/, '');
  return normalized || DEFAULT_SITE_URL;
}

function slugify(fileName) {
  return fileName.replace(/\.md$/i, '');
}

function inferDateFromSlug(slug) {
  const match = String(slug || '').match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : '';
}

function excerptFromBody(content) {
  const plain = content.replace(/[#>*_`()[\]-]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 180) + (plain.length > 180 ? '...' : '');
}

function parseDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatPostDate(value) {
  const raw = String(value || '').trim();
  const timestamp = parseDate(value);
  if (!timestamp) return raw;

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(timestamp));
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function slugFromWikiName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveWikiTargetSlug(target, activeSlugs = []) {
  const normalized = slugFromWikiName(target);
  if (!normalized) {
    return '';
  }

  const exact = activeSlugs.find((slug) => slugFromWikiName(slug) === normalized);
  if (exact) {
    return exact;
  }

  return activeSlugs.find((slug) => slugFromWikiName(slug).endsWith(`-${normalized}`)) || '';
}

function parseMetadataLine(line) {
  const match = String(line || '').match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: match[2].trim()
  };
}

function recoverMetadata(raw, parsed) {
  const fallbackData = {};
  const knownKeys = new Set(['id', 'version', 'title', 'date', 'published_at', 'created_at', 'updated_at', 'author', 'reviewed_by', 'category', 'excerpt', 'tags', 'cover_query', 'cover_provider', 'cover_provider_id', 'cover_image', 'cover_alt', 'cover_focus', 'cover_credit', 'cover_credit_url', 'cover_source_url']);

  const hasParsedData = parsed && parsed.data && Object.keys(parsed.data).length > 0;
  if (hasParsedData) {
    return {
      data: parsed.data,
      content: parsed.content
    };
  }

  const text = String(raw || '');
  const lines = text.split(/\r?\n/);

  // Fallback 1: recover YAML block delimited by --- ... --- when gray-matter returns empty data.
  if (lines[0] === '---') {
    const closingIdx = lines.findIndex((line, idx) => idx > 0 && line === '---');
    if (closingIdx > 0) {
      for (const line of lines.slice(1, closingIdx)) {
        const parsedLine = parseMetadataLine(line);
        if (!parsedLine || !knownKeys.has(parsedLine.key)) {
          continue;
        }
        fallbackData[parsedLine.key] = parsedLine.value;
      }

      if (Object.keys(fallbackData).length > 0) {
        return {
          data: fallbackData,
          content: lines.slice(closingIdx + 1).join('\n').replace(/^\n+/, '')
        };
      }
    }
  }

  // Fallback 2: recover plain key/value metadata header at the top, followed by a blank line.
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      break;
    }

    const parsedLine = parseMetadataLine(line);
    if (!parsedLine || !knownKeys.has(parsedLine.key)) {
      break;
    }

    fallbackData[parsedLine.key] = parsedLine.value;
    cursor += 1;
  }

  if (Object.keys(fallbackData).length > 0 && cursor < lines.length && !lines[cursor].trim()) {
    return {
      data: fallbackData,
      content: lines.slice(cursor + 1).join('\n')
    };
  }

  return {
    data: {},
    content: parsed.content || text
  };
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return md.utils.escapeHtml(code);
  }
});

installSnippetRenderer(md);
md.use(mdFootnote);
md.use(mdAbbr);

const defaultAbbrOpenRule = md.renderer.rules.abbr_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.abbr_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const label = tokens[idx + 1]?.content || '';
  const key = canonicalGlossaryKey(label);

  if (key) {
    token.attrJoin('class', 'glossary-term');
    token.attrSet('data-glossary-key', key);
    token.attrSet('data-glossary-slug', glossarySlug(key));
  }

  return defaultAbbrOpenRule(tokens, idx, options, env, self);
};

function transformWikiLinks(content, activeSlugs = []) {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const cleanTarget = String(target || '').trim();
    const cleanLabel = String(label || cleanTarget).trim();
    const resolvedSlug = resolveWikiTargetSlug(cleanTarget, activeSlugs);

    if (!resolvedSlug) {
      return cleanLabel;
    }

    return `[${cleanLabel}](/posts/${slugFromWikiName(cleanTarget)})`;
  });
}

['note', 'tip', 'warning'].forEach((type) => {
  md.use(mdContainer, type, {
    render(tokens, idx) {
      const token = tokens[idx];
      const titleText = token.info.slice(type.length).trim();
      const title = titleText || type.charAt(0).toUpperCase() + type.slice(1);

      if (token.nesting === 1) {
        return `<div class="admonition admonition-${type}"><p class="admonition-title">${md.utils.escapeHtml(title)}</p>\n`;
      }

      return '</div>\n';
    }
  });
});

const defaultFenceRule = md.renderer.rules.fence || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || '').trim();

  if (info === 'mermaid') {
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`;
  }

  return defaultFenceRule(tokens, idx, options, env, self);
};

function getPostsCacheTtlMs() {
  const configured = Number.parseInt(
    String(process.env.POSTS_CACHE_TTL_MS ?? DEFAULT_POSTS_CACHE_TTL_MS),
    10
  );

  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_POSTS_CACHE_TTL_MS;
  }

  return configured;
}

async function loadPosts(postsDir) {
  let entries;
  try {
    entries = await fs.readdir(postsDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
  const legacy = JSON.parse(await fs.readFile(path.join(root, 'snippets/manifest.json'), 'utf8'));
  const activeSlugs = files.map((file) => slugify(file.name));

  const posts = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(postsDir, file.name);
      const raw = await fs.readFile(fullPath, 'utf-8');
      const parsed = matter(raw);
      const recovered = recoverMetadata(raw, parsed);
      const slug = slugify(file.name);
      const title = recovered.data.title || slug;
      const inferredDate = inferDateFromSlug(slug);
      const date = recovered.data.date || recovered.data.created_at || inferredDate || '1970-01-01';
      const publishedAt = recovered.data.published_at || recovered.data.created_at || date;
      const updatedAt = recovered.data.updated_at || publishedAt || date;
      const author = recovered.data.author || 'obivan';
      const version = recovered.data.version || 1;
      const category = recovered.data.category || 'IT';
      const tags = normalizeTags(recovered.data.tags);
      const excerpt = recovered.data.excerpt || excerptFromBody(recovered.content);
      const coverImage = String(recovered.data.cover_image || '').trim();
      const coverFocus = String(recovered.data.cover_focus || 'center').trim();
      const coverCredit = String(recovered.data.cover_credit || '').trim();
      const coverCreditUrl = String(recovered.data.cover_credit_url || '').trim();
      const wordCount = countWords(recovered.content);
      const readingTime = calculateReadingTime(recovered.content);
      const markdownContent = withGlossaryDefinitions(transformWikiLinks(recovered.content, activeSlugs));

      const snippets = resolveSnippets({ slug, title, data: recovered.data, markdown: recovered.content, legacy });
      return {
        snippets,
        slug,
        title,
        date,
        publishedAt,
        updatedAt,
        author,
        version,
        category,
        tags,
        excerpt,
        coverImage,
        coverFocus,
        coverCredit,
        coverCreditUrl,
        wordCount,
        readingTime,
        html: md.render(markdownContent, { snippets })
      };
    })
  );

  posts.sort((a, b) => {
    const publishedDelta = parseDate(b.publishedAt) - parseDate(a.publishedAt);
    if (publishedDelta !== 0) {
      return publishedDelta;
    }

    return parseDate(b.date) - parseDate(a.date);
  });
  return posts;
}

async function readPosts(explicitPostsDir) {
  const postsDir = path.resolve(getPostsDir(explicitPostsDir));
  const ttlMs = getPostsCacheTtlMs();
  const now = Date.now();
  const cached = postsCache.get(postsDir);

  if (ttlMs > 0 && cached?.posts && cached.expiresAt > now) {
    return cached.posts;
  }

  if (cached?.loading) {
    return cached.loading;
  }

  const loading = loadPosts(postsDir)
    .then((posts) => {
      if (ttlMs > 0) {
        postsCache.set(postsDir, {
          posts,
          expiresAt: Date.now() + ttlMs,
          loading: null
        });
      } else {
        postsCache.delete(postsDir);
      }

      return posts;
    })
    .catch((error) => {
      postsCache.delete(postsDir);
      throw error;
    });

  postsCache.set(postsDir, {
    posts: cached?.posts || null,
    expiresAt: 0,
    loading
  });

  return loading;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCdata(value) {
  return String(value || '').replace(/]]>/g, ']]]]><![CDATA[>');
}

function absolutizeHtml(html, explicitSiteUrl) {
  const siteUrl = getSiteUrl(explicitSiteUrl);
  return String(html || '')
    .replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_match, attribute, value) => `${attribute}="${siteUrl}/${value}"`)
    .replace(/\b(href|src)='\/(?!\/)([^']*)'/g, (_match, attribute, value) => `${attribute}='${siteUrl}/${value}'`);
}

function rssDate(value) {
  const timestamp = parseDate(value);
  return timestamp ? new Date(timestamp).toUTCString() : '';
}

function generateRssFeed(posts, explicitSiteUrl) {
  const siteUrl = getSiteUrl(explicitSiteUrl);
  const feedUrl = `${siteUrl}/rss.xml`;
  const latestDate = posts.map((post) => rssDate(post.date)).find(Boolean);
  const items = posts
    .slice(0, 20)
    .map((post) => {
      const postUrl = `${siteUrl}/posts/${post.slug}`;
      const categories = [...new Set([post.category, ...normalizeTags(post.tags)].filter(Boolean))]
        .map((category) => `      <category>${escapeXml(category)}</category>`)
        .join('\n');
      const pubDate = rssDate(post.date);
      const fullHtml = absolutizeHtml(post.html, siteUrl);

      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
${pubDate ? `      <pubDate>${pubDate}</pubDate>\n` : ''}      <description>${escapeXml(post.excerpt)}</description>
${categories ? `${categories}\n` : ''}      <content:encoded><![CDATA[${escapeCdata(fullHtml)}]]></content:encoded>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kernel Notes</title>
    <link>${escapeXml(`${siteUrl}/`)}</link>
    <description>IT-Blog über Cloud, Linux, Security und Automation</description>
    <language>de-de</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${latestDate ? `    <lastBuildDate>${latestDate}</lastBuildDate>\n` : ''}${items ? `${items}\n` : ''}  </channel>
</rss>`;
}

function resolvePostBySlug(posts, requestedSlug) {
  const normalized = slugFromWikiName(requestedSlug || '');
  if (!normalized) {
    return null;
  }

  const exact = posts.find((item) => slugFromWikiName(item.slug) === normalized);
  if (exact) {
    return exact;
  }

  return posts.find((item) => slugFromWikiName(item.slug).endsWith(`-${normalized}`)) || null;
}

const RELATED_TITLE_STOP_WORDS = new Set([
  'aber', 'auch', 'das', 'dem', 'den', 'der', 'die', 'ein', 'eine', 'einer', 'eines',
  'fuer', 'ist', 'mit', 'nicht', 'oder', 'sich', 'und', 'von', 'was', 'wie', 'zu', 'zum', 'zur'
]);

function normalizeComparable(value) {
  return slugFromWikiName(value || '');
}

function titleTerms(title) {
  return new Set(
    normalizeComparable(title)
      .split('-')
      .filter((term) => term.length >= 3 && !RELATED_TITLE_STOP_WORDS.has(term))
  );
}

function relatedPostScore(currentPost, candidatePost) {
  if (!currentPost || !candidatePost || currentPost.slug === candidatePost.slug) {
    return 0;
  }

  let score = 0;
  const currentCategory = normalizeComparable(currentPost.category);
  const candidateCategory = normalizeComparable(candidatePost.category);

  if (currentCategory && currentCategory === candidateCategory) {
    score += 5;
  }

  const currentTags = new Set(normalizeTags(currentPost.tags).map(normalizeComparable).filter(Boolean));
  const candidateTags = new Set(normalizeTags(candidatePost.tags).map(normalizeComparable).filter(Boolean));

  for (const tag of currentTags) {
    if (candidateTags.has(tag)) {
      score += 3;
    }
  }

  const currentTitleTerms = titleTerms(currentPost.title);
  const candidateTitleTerms = titleTerms(candidatePost.title);

  for (const term of currentTitleTerms) {
    if (candidateTitleTerms.has(term)) {
      score += 1;
    }
  }

  return score;
}

function findRelatedPosts(posts, currentPost, limit = 3) {
  const maxResults = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;

  return posts
    .filter((candidate) => candidate.slug !== currentPost.slug)
    .map((candidate) => ({
      post: candidate,
      score: relatedPostScore(currentPost, candidate)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const dateDelta = parseDate(b.post.publishedAt) - parseDate(a.post.publishedAt);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      return String(a.post.title || '').localeCompare(String(b.post.title || ''), 'de');
    })
    .slice(0, maxResults)
    .map(({ post }) => post);
}

function renderRelatedPosts(relatedPosts) {
  if (!relatedPosts.length) {
    return '';
  }

  const cards = relatedPosts
    .map((relatedPost) => {
      const title = md.utils.escapeHtml(String(relatedPost.title || relatedPost.slug));
      const excerpt = md.utils.escapeHtml(String(relatedPost.excerpt || ''));
      const category = md.utils.escapeHtml(String(relatedPost.category || 'IT'));
      const date = md.utils.escapeHtml(String(relatedPost.date || ''));
      const tags = normalizeTags(relatedPost.tags)
        .slice(0, MAX_VISIBLE_TAGS)
        .map((tag) => `<span class="tag-chip">${md.utils.escapeHtml(tag)}</span>`)
        .join('');

      return `
        <a class="related-post-card" href="/posts/${relatedPost.slug}">
          <p class="meta">${category}${date ? ` · ${date}` : ''}</p>
          <h3>${title}</h3>
          ${excerpt ? `<p>${excerpt}</p>` : ''}
          ${tags ? `<div class="related-post-tags">${tags}</div>` : ''}
        </a>`;
    })
    .join('');

  return `
        <section class="related-posts" aria-labelledby="related-posts-title">
          <p class="eyebrow">Weiterlesen</p>
          <h2 id="related-posts-title">Verwandte Beiträge</h2>
          <div class="related-post-grid">${cards}
          </div>
        </section>`;
}

function getLegalInfo() {
  return {
    operatorName: process.env.LEGAL_OPERATOR_NAME || 'Ivan Babayev',
    operatorRole: process.env.LEGAL_OPERATOR_ROLE || 'AWS Cloud Infrastructure Engineer bei e2n',
    operatorLocation: process.env.LEGAL_OPERATOR_LOCATION || 'Würzburg, Bayern, Deutschland',
    street: process.env.LEGAL_STREET || '[Straße und Hausnummer]',
    postalCity: process.env.LEGAL_POSTAL_CITY || '[PLZ Ort]',
    country: process.env.LEGAL_COUNTRY || 'Deutschland',
    email: process.env.LEGAL_EMAIL || '[deine-email@example.com]',
    phone: process.env.LEGAL_PHONE || '[optional]',
    contentResponsible: process.env.LEGAL_CONTENT_RESPONSIBLE || 'Ivan Babayev',
    contentAddress: process.env.LEGAL_CONTENT_ADDRESS || '[Anschrift wie oben]'
  };
}

function renderPostPage(post, relatedPosts = []) {
  const meta = `${md.utils.escapeHtml(String(post.category || 'IT'))} · ${md.utils.escapeHtml(formatPostDate(post.date))} · ${post.readingTime || 1} Min. Lesezeit`;
  const tags = normalizeTags(post.tags).slice(0, MAX_VISIBLE_TAGS);
  const visibleTagCount = 4;
  const hiddenTagCount = Math.max(0, tags.length - visibleTagCount);
  const tagsHtml = tags
    .map((tag, index) => `<span class="tag-chip"${index >= visibleTagCount ? ' data-extra-tag hidden' : ''}>${md.utils.escapeHtml(tag)}</span>`)
    .join('')
    + (hiddenTagCount
      ? `<button class="tag-chip tag-toggle" type="button" data-tag-toggle data-hidden-count="${hiddenTagCount}" aria-expanded="false" aria-label="${hiddenTagCount} weitere Tags anzeigen">+${hiddenTagCount}</button>`
      : '');
  const relatedPostsHtml = renderRelatedPosts(relatedPosts);
  const coverCreditHtml = post.coverCredit
    ? `<p class="article-hero__credit">${post.coverCreditUrl
      ? `<a href="${md.utils.escapeHtml(String(post.coverCreditUrl))}" target="_blank" rel="noopener noreferrer">${md.utils.escapeHtml(String(post.coverCredit))}</a>`
      : md.utils.escapeHtml(String(post.coverCredit))}</p>`
    : '';

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${post.title} | Kernel Notes</title>
    <meta name="description" content="${post.excerpt}" />
    <link rel="alternate" type="application/rss+xml" title="Kernel Notes RSS" href="/rss.xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css?v=20260819-2" />
    <link rel="stylesheet" href="/image-viewer.css?v=20260819-3" />
    <link rel="stylesheet" href="/assets/related-posts.css" />
    <link rel="stylesheet" href="/assets/css/glossary.css" />
    <link rel="stylesheet" href="/assets/css/article-metrics.css?v=20260921-8" />
  </head>
  <body class="post-detail">
    <div class="bg-grid" aria-hidden="true"></div>
    <div class="bg-radial bg-radial-1" aria-hidden="true"></div>
    <div class="bg-radial bg-radial-2" aria-hidden="true"></div>

    <header class="site-header">
      <a class="logo" href="/" aria-label="Kernel Notes – Startseite">Kernel Notes</a>
      <nav class="main-nav" aria-label="Hauptnavigation">
        <a href="/#posts">Artikel</a>
        <a href="/#topics">Themen</a>
        <a href="/snippets/">Snippets</a>
        <a href="/glossary">Glossar</a>
        <a href="/knowledge">Wissensnetz</a>
        <a href="/archive">Archiv</a>
      </nav>
    </header>

    <main>
      <article class="post-page" data-post-slug="${md.utils.escapeHtml(String(post.slug || ''))}">
        <div class="reading-progress" data-reading-progress>
          <button class="reading-progress__toggle" type="button" data-reading-progress-toggle aria-expanded="true" aria-label="Lesefortschritt: 0 Prozent">
            <span class="reading-progress__bubble" aria-hidden="true">
              <span class="reading-progress__bubble-fill"></span>
              <canvas class="reading-progress__rive" data-reading-progress-rive width="92" height="92" aria-hidden="true"></canvas>
              <span class="reading-progress__bubble-gloss"></span>
              <span class="reading-progress__compact-value"><strong data-reading-progress-value-compact>0</strong><span>%</span></span>
            </span>
            <span class="reading-progress__track" data-reading-progress-meter role="progressbar" aria-label="Lesefortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <span class="reading-progress__bar" data-reading-progress-bar></span>
            </span>
            <span class="reading-progress__label"><strong data-reading-progress-value>0</strong><span>% gelesen</span></span>
          </button>
        </div>
        <div class="article-hero" data-article-hero>
          <p class="meta article-meta">${meta}</p>
        <h1 class="article-title">${post.title}</h1>
          ${coverCreditHtml}
        </div>
        <div class="article-metrics" aria-label="Artikelinformationen">
          <span class="article-metric" tabindex="0" data-tooltip="Aufrufe – wie oft dieser Artikel geöffnet wurde." aria-label="Aufrufe: Anzahl der Seitenaufrufe dieses Artikels.">
            <span class="article-metric__icon" aria-hidden="true">👁</span>
            <strong data-article-metric="views">–</strong>
          </span>
          <span class="article-metric" tabindex="0" data-tooltip="Likes – wie viele Leser diesen Artikel hilfreich fanden." aria-label="Likes: Anzahl der Likes für diesen Artikel.">
            <span class="article-metric__icon" aria-hidden="true">♡</span>
            <strong data-article-metric="likes">–</strong>
          </span>
        </div>
        ${tagsHtml ? `<div class="tag-list" aria-label="Tags">${tagsHtml}</div>` : ''}
        <section class="terminal-post" aria-label="Terminal article view">
          <div class="terminal-chrome">
            <button class="terminal-dot terminal-dot-red" type="button" data-terminal-action="overview" aria-label="Zurück zur Übersicht"></button>
            <button class="terminal-dot terminal-dot-yellow" type="button" data-terminal-action="restore" aria-label="Terminal wiederherstellen"></button>
            <button class="terminal-dot terminal-dot-green" type="button" data-terminal-action="maximize" aria-label="Terminal maximieren"></button>
            <p class="terminal-title">live-terminal://kernel-notes/${post.title}</p>
          </div>
          <div class="post-content terminal-content">${post.html}</div>
        </section>
        <section class="article-engagement" aria-labelledby="article-engagement-title">
          <h2 id="article-engagement-title">Hat dir der Artikel geholfen?</h2>
          <p>Deine Rückmeldung hilft dabei, die Inhalte gezielt zu verbessern.</p>
          <div class="article-engagement__actions">
            <button class="article-action article-action--primary article-like" type="button" data-article-like aria-pressed="false">
              <span class="article-action__icon" data-like-icon aria-hidden="true">♡</span>
              <span><span data-like-label>Gefällt mir</span> · <strong data-article-metric="likes">–</strong></span>
            </button>
            <details class="article-download">
              <summary class="article-action article-download__summary">
                <span class="article-action__icon" aria-hidden="true">↓</span>
                <span>Herunterladen</span>
              </summary>
              <div class="article-download__menu" role="group" aria-label="Artikel herunterladen">
                <a href="/download/${encodeURIComponent(post.slug)}.epub" download>
                  <strong>EPUB</strong>
                  <span>E-Book mit Cover & Metadaten</span>
                </a>
                <a href="/download/${encodeURIComponent(post.slug)}.pdf" download>
                  <strong>PDF</strong>
                  <span>aus dem EPUB erzeugt</span>
                </a>
              </div>
            </details>
            <button class="article-action article-action--share" type="button" data-article-share>
              <span class="article-action__icon" aria-hidden="true">↗</span>
              <span>Teilen</span>
            </button>
          </div>
          <p class="article-action-status" data-article-action-status aria-live="polite"></p>
        </section>
        ${relatedPostsHtml}
        <p><a class="read-more" href="/">Zurück zur Startseite</a></p>
        <p><a class="read-more" href="/impressum">Zum Impressum</a></p>
      </article>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/medium-zoom@1.1.0/dist/medium-zoom.min.js"></script>
    <script>
      document.querySelectorAll('.terminal-content img').forEach((image) => {
        image.loading = 'lazy';
        image.decoding = 'async';
      });

      if (typeof mediumZoom === 'function') {
        mediumZoom('.terminal-content img', {
          margin: 24,
          background: 'rgba(8, 12, 18, 0.94)',
          scrollOffset: 60
        });
      }
    </script>
    <script src="/script.js?v=20260819-2"></script>
    <script src="/assets/glossary.js" defer></script>
    <script src="/assets/article-analytics.js?v=20260921-8" defer></script>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

      const mermaidBlocks = document.querySelectorAll('.mermaid');
      if (mermaidBlocks.length) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark'
        });
        mermaid.run({ nodes: mermaidBlocks });
      }
    </script>
  </body>
</html>`;
}

function createApp(options = {}) {
  const app = express();
  const postsDir = options.postsDir;
  const siteUrl = options.siteUrl;
  const ebookExporterLoader = options.ebookExporterLoader || (() => require('./lib/ebook-export'));

  app.use('/assets', express.static(path.join(root, 'assets')));
  app.get('/snippets/manifest.json', async (_req, res) => {
    try {
      const posts = await readPosts(postsDir);
      res.json(posts.flatMap((post) => post.snippets));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Could not load snippet manifest' });
    }
  });
  app.use(express.static(root, { extensions: ['html'] }));

  app.get('/api/legal-info', (_req, res) => {
    res.json(getLegalInfo());
  });

  app.get('/api/posts', async (_req, res) => {
    try {
      const posts = await readPosts(postsDir);
      const dto = posts.map(({ slug, title, date, category, tags, excerpt, readingTime }) => ({
        slug,
        title,
        date,
        category,
        tags,
        excerpt,
        readingTime
      }));
      res.json(dto);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Could not load posts' });
    }
  });

  app.get('/rss.xml', async (_req, res) => {
    try {
      const posts = await readPosts(postsDir);
      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(generateRssFeed(posts, siteUrl));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not generate RSS feed');
    }
  });

  app.get('/glossary', (_req, res) => {
    res.type('html').send(renderGlossaryPage());
  });

  app.get('/download/:file', async (req, res) => {
    const match = String(req.params.file || '').match(/^(.+)\.(epub|pdf)$/i);
    if (!match) {
      res.status(404).send('Download not found');
      return;
    }

    const [, requestedSlug, rawFormat] = match;
    const format = rawFormat.toLowerCase();

    try {
      const posts = await readPosts(postsDir);
      const post = resolvePostBySlug(posts, requestedSlug);

      if (!post) {
        res.status(404).send('Post not found');
        return;
      }

      const exporter = await Promise.resolve(ebookExporterLoader());
      const exportOptions = {
        siteUrl: getSiteUrl(siteUrl),
        assetRoot: root
      };
      const content = format === 'epub'
        ? await exporter.buildArticleEpub(post, exportOptions)
        : await exporter.buildArticlePdf(post, exportOptions);

      res.set('Content-Type', format === 'epub' ? 'application/epub+zip' : 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="${post.slug}.${format}"`);
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).send(content);
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not generate article download');
    }
  });

  app.get('/posts/:slug', async (req, res) => {
    try {
      const posts = await readPosts(postsDir);
      const post = resolvePostBySlug(posts, req.params.slug);

      if (!post) {
        res.status(404).send('Post not found');
        return;
      }

      const relatedPosts = findRelatedPosts(posts, post, 3);
      res.type('html').send(renderPostPage(post, relatedPosts));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render post');
    }
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  // Express 5 requires a named wildcard; wrapping it in braces also matches '/'.
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(root, 'index.html'));
  });

  return app;
}

function startServer() {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`kernel-notes listening on :${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
  getPostsDir,
  getSiteUrl,
  slugify,
  excerptFromBody,
  parseDate,
  normalizeTags,
  slugFromWikiName,
  resolveWikiTargetSlug,
  transformWikiLinks,
  inferDateFromSlug,
  recoverMetadata,
  resolvePostBySlug,
  escapeXml,
  escapeCdata,
  absolutizeHtml,
  rssDate,
  generateRssFeed,
  relatedPostScore,
  findRelatedPosts,
  renderRelatedPosts,
  getLegalInfo,
  readPosts,
  renderGlossaryPage,
  renderPostPage
};
