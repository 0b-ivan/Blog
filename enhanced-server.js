const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const legacy = require('./server');

const port = process.env.PORT || 8080;
const root = __dirname;
const postsDir = process.env.POSTS_DIR || path.join(root, 'posts');
const archiveDir = process.env.ARCHIVE_DIR || path.join(root, 'archive');
const historyDir = process.env.POST_HISTORY_DIR || path.join(root, 'post-history');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tagUrl(tag) {
  return `/tags/${encodeURIComponent(String(tag || '').trim())}`;
}

function tagLink(tag) {
  const label = String(tag || '').trim();
  return `<a class="tag-chip" href="${tagUrl(label)}">${escapeHtml(label)}</a>`;
}

function filterPostsByTag(posts, requestedTag) {
  const wanted = String(requestedTag || '').trim().toLocaleLowerCase('de');
  if (!wanted) {
    return [];
  }

  return posts.filter((post) => legacy.normalizeTags(post.tags)
    .some((tag) => tag.toLocaleLowerCase('de') === wanted));
}

function canonicalTag(posts, requestedTag) {
  const wanted = String(requestedTag || '').trim().toLocaleLowerCase('de');
  for (const post of posts) {
    const matchingTag = legacy.normalizeTags(post.tags)
      .find((tag) => tag.toLocaleLowerCase('de') === wanted);
    if (matchingTag) {
      return matchingTag;
    }
  }
  return String(requestedTag || '').trim();
}

async function readManifest(slug) {
  try {
    const raw = await fs.readFile(path.join(historyDir, slug, 'manifest.json'), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function resolveHistorySlug(requestedSlug) {
  const normalized = legacy.slugFromWikiName(requestedSlug || '');
  if (!normalized) {
    return null;
  }

  let entries;
  try {
    entries = await fs.readdir(historyDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const slugs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const exact = slugs.find((slug) => legacy.slugFromWikiName(slug) === normalized);
  if (exact) {
    return exact;
  }

  return slugs.find((slug) => legacy.slugFromWikiName(slug).endsWith(`-${normalized}`)) || null;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || '');
  }
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

function addArchiveNavigation(html) {
  if (html.includes('href="/archive"')) {
    return html;
  }
  return html.replace(
    '<a href="/impressum">Impressum</a>',
    '<a href="/archive">Archiv</a>\n        <a href="/impressum">Impressum</a>'
  );
}

function addHistoryStyles(html) {
  if (html.includes('/assets/css/history.css')) {
    return html;
  }
  return html.replace('</head>', '    <link rel="stylesheet" href="/assets/css/history.css" />\n  </head>');
}

function addTagNavigationAssets(html) {
  let output = html;
  if (!output.includes('/assets/css/tag-links.css')) {
    output = output.replace('</head>', '    <link rel="stylesheet" href="/assets/css/tag-links.css" />\n  </head>');
  }
  if (!output.includes('/assets/tag-navigation.js')) {
    output = output.replace('</body>', '    <script src="/assets/tag-navigation.js"></script>\n  </body>');
  }
  return output;
}

function injectArticleFooter(html, markup) {
  const relatedMarker = '<section class="related-posts"';
  const relatedIndex = html.indexOf(relatedMarker);
  if (relatedIndex >= 0) {
    return `${html.slice(0, relatedIndex)}${markup}\n        ${html.slice(relatedIndex)}`;
  }

  const navigationMarker = '<p><a class="read-more" href="/">';
  const navigationIndex = html.indexOf(navigationMarker);
  if (navigationIndex >= 0) {
    return `${html.slice(0, navigationIndex)}${markup}\n        ${html.slice(navigationIndex)}`;
  }

  return html;
}

function versionFooter(slug, manifest, options = {}) {
  if (!manifest || !manifest.currentVersion) {
    return '';
  }

  const currentVersion = Number(manifest.currentVersion);
  const viewingVersion = options.viewingVersion ? Number(options.viewingVersion) : currentVersion;
  const archived = manifest.status === 'archived';
  const currentUrl = archived ? `/archive/${slug}` : `/posts/${slug}`;
  const historical = viewingVersion !== currentVersion;

  return `<aside class="post-version-footer" aria-label="Artikelversion">
          <div class="post-version-footer__identity">
            <span class="post-version-footer__label">${historical ? 'Historische Version' : 'Artikelversion'}</span>
            <strong class="post-version-footer__number">v${viewingVersion}</strong>
            ${historical ? '' : '<span class="current-badge">Aktuell</span>'}
            ${archived ? '<span class="archive-badge">Archiviert</span>' : ''}
          </div>
          <nav class="post-version-footer__actions" aria-label="Versionsnavigation">
            <a href="/history/${slug}">Versionsverlauf</a>
            ${historical ? `<a href="${currentUrl}">Aktuelle Version v${currentVersion}</a>` : ''}
          </nav>
        </aside>`;
}

function decoratePostHtml(html, slug, manifest, options = {}) {
  let output = addTagNavigationAssets(addHistoryStyles(addArchiveNavigation(html)));
  const footer = versionFooter(slug, manifest, options);
  if (footer) {
    output = injectArticleFooter(output, footer);
  }

  if (options.historical) {
    output = output.replace(
      '</body>',
      `<script>
      document.querySelectorAll('.terminal-content a[title^="snippet:"][href^="/history-assets/"]').forEach((link) => {
        const details = document.createElement('details');
        details.className = 'history-snippet';
        const summary = document.createElement('summary');
        summary.textContent = link.textContent || 'Historischen Code anzeigen';
        const pre = document.createElement('pre');
        pre.hidden = true;
        const code = document.createElement('code');
        pre.append(code);
        details.append(summary, pre);
        link.parentElement?.replaceWith(details);
        let loaded = false;
        details.addEventListener('toggle', async () => {
          if (!details.open || loaded) return;
          const response = await fetch(link.href);
          code.textContent = response.ok ? await response.text() : 'Historischer Code konnte nicht geladen werden.';
          pre.hidden = false;
          loaded = true;
        });
      });
    </script>\n  </body>`
    );
  }

  return output;
}

function pageShell(title, body) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} | Kernel Notes</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/assets/css/history.css" />
    <link rel="stylesheet" href="/assets/css/tag-links.css" />
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>
    <header class="site-header">
      <a class="logo" href="/">Kernel Notes</a>
      <nav class="main-nav" aria-label="Hauptnavigation">
        <a href="/#posts">Artikel</a>
        <a href="/#topics">Themen</a>
        <a href="/snippets/">Snippets</a>
        <a href="/#about">About</a>
        <a href="/archive">Archiv</a>
        <a href="/impressum">Impressum</a>
      </nav>
    </header>
    <main class="history-page">${body}</main>
    <script src="/assets/tag-navigation.js"></script>
  </body>
</html>`;
}

function collectionCard(post, href) {
  const tags = legacy.normalizeTags(post.tags).slice(0, 10).map(tagLink).join('');
  return `<article class="archive-card collection-card">
      <p class="meta">${escapeHtml(post.category)} · ${escapeHtml(post.date)}</p>
      <h2><a class="collection-card__title" href="${href}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.excerpt)}</p>
      ${tags ? `<div class="tag-list">${tags}</div>` : ''}
      <a class="read-more" href="${href}">Artikel lesen</a>
    </article>`;
}

async function renderArchiveIndex() {
  const posts = await legacy.readPosts(archiveDir);
  if (!posts.length) {
    return pageShell('Archiv', '<section class="history-panel"><p class="eyebrow">Archiv</p><h1>Archivierte Artikel</h1><p>Noch keine Artikel archiviert.</p></section>');
  }

  const cards = await Promise.all(posts.map(async (post) => {
    const manifest = await readManifest(post.slug);
    const href = `/archive/${post.slug}`;
    const tags = legacy.normalizeTags(post.tags).slice(0, 10).map(tagLink).join('');
    return `<article class="archive-card collection-card">
      <p class="meta">${escapeHtml(post.category)} · ${escapeHtml(post.date)}${manifest?.currentVersion ? ` · v${manifest.currentVersion}` : ''}</p>
      <h2><a class="collection-card__title" href="${href}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.excerpt)}</p>
      ${tags ? `<div class="tag-list">${tags}</div>` : ''}
      <a class="read-more" href="${href}">Archivierten Artikel lesen</a>
    </article>`;
  }));

  return pageShell('Archiv', `<section class="history-panel"><p class="eyebrow">Archiv</p><h1>Archivierte Artikel</h1><p>Diese Beiträge sind nicht mehr in der normalen Artikelliste, bleiben aber dauerhaft lesbar.</p><div class="archive-grid">${cards.join('')}</div></section>`);
}

function renderTagIndex(tag, posts) {
  const cards = posts.map((post) => collectionCard(post, `/posts/${post.slug}`)).join('');
  return pageShell(
    `Tag: ${tag}`,
    `<section class="history-panel tag-results"><p class="eyebrow">Tag</p><h1>${escapeHtml(tag)}</h1><p>${posts.length} ${posts.length === 1 ? 'Artikel' : 'Artikel'} mit diesem Tag.</p><div class="archive-grid">${cards}</div></section>`
  );
}

async function renderHistoryIndex(slug, manifest) {
  const currentUrl = manifest.status === 'archived' ? `/archive/${slug}` : `/posts/${slug}`;
  const rows = [...manifest.versions].reverse().map((entry) => {
    const current = Number(entry.version) === Number(manifest.currentVersion);
    return `<li class="history-version${current ? ' is-current' : ''}">
      <div><strong>v${entry.version}</strong>${current ? ' <span class="current-badge">aktuell</span>' : ''}<br><span>${escapeHtml(formatDate(entry.committedAt))}</span></div>
      <div class="history-actions"><a href="/history/${slug}/v${entry.version}">Version ansehen</a>${current ? ` <a href="${currentUrl}">Artikel öffnen</a>` : ''}</div>
    </li>`;
  }).join('');

  return pageShell('Versionsverlauf', `<section class="history-panel"><p class="eyebrow">Versionsverlauf</p><h1>${escapeHtml(manifest.title)}</h1><p>${manifest.status === 'archived' ? 'Dieser Artikel ist archiviert.' : 'Aktueller veröffentlichter Artikel.'} Änderungen an Markdown, referenzierten Snippets und Artikelbildern erzeugen automatisch neue Versionen.</p><ol class="history-list">${rows}</ol></section>`);
}

function createApp() {
  const app = express();

  app.use('/history-assets', express.static(historyDir, { index: false, fallthrough: false }));

  app.get('/', async (_req, res, next) => {
    try {
      const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
      res.type('html').send(addTagNavigationAssets(html));
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        next();
        return;
      }
      console.error(error);
      res.status(500).send('Could not render home page');
    }
  });

  app.get('/tags/:tag', async (req, res) => {
    try {
      const posts = await legacy.readPosts(postsDir);
      const matchingPosts = filterPostsByTag(posts, req.params.tag);
      if (!matchingPosts.length) {
        res.status(404).send('Tag not found');
        return;
      }
      const tag = canonicalTag(matchingPosts, req.params.tag);
      res.type('html').send(renderTagIndex(tag, matchingPosts));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render tag');
    }
  });

  app.get('/archive', async (_req, res) => {
    try {
      res.type('html').send(await renderArchiveIndex());
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render archive');
    }
  });

  app.get('/archive/:slug', async (req, res) => {
    try {
      const archivedPosts = await legacy.readPosts(archiveDir);
      const post = legacy.resolvePostBySlug(archivedPosts, req.params.slug);
      if (!post) {
        res.status(404).send('Archived post not found');
        return;
      }

      const activePosts = await legacy.readPosts(postsDir);
      const related = legacy.findRelatedPosts(activePosts, post, 3);
      const manifest = await readManifest(post.slug);
      const html = legacy.renderPostPage(post, related);
      res.type('html').send(decoratePostHtml(html, post.slug, manifest));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render archived post');
    }
  });

  app.get('/history/:slug', async (req, res) => {
    try {
      const slug = await resolveHistorySlug(req.params.slug);
      const manifest = slug ? await readManifest(slug) : null;
      if (!slug || !manifest) {
        res.status(404).send('Post history not found');
        return;
      }
      res.type('html').send(await renderHistoryIndex(slug, manifest));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render post history');
    }
  });

  app.get('/history/:slug/v:version', async (req, res) => {
    try {
      const slug = await resolveHistorySlug(req.params.slug);
      const manifest = slug ? await readManifest(slug) : null;
      const version = Number.parseInt(req.params.version, 10);
      if (!slug || !manifest || !Number.isInteger(version) || version < 1 || version > manifest.currentVersion) {
        res.status(404).send('Post version not found');
        return;
      }

      const versionDir = path.join(historyDir, slug, `v${version}`);
      const versions = await legacy.readPosts(versionDir);
      const post = versions[0];
      if (!post) {
        res.status(404).send('Post version not found');
        return;
      }

      const html = legacy.renderPostPage(post, []);
      res.type('html').send(decoratePostHtml(html, slug, manifest, {
        historical: true,
        viewingVersion: version
      }));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render post version');
    }
  });

  app.get('/posts/:slug', async (req, res, next) => {
    try {
      const posts = await legacy.readPosts(postsDir);
      const post = legacy.resolvePostBySlug(posts, req.params.slug);
      if (!post) {
        next();
        return;
      }

      const related = legacy.findRelatedPosts(posts, post, 3);
      const manifest = await readManifest(post.slug);
      const html = legacy.renderPostPage(post, related);
      res.type('html').send(decoratePostHtml(html, post.slug, manifest));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render post');
    }
  });

  app.use(legacy.createApp({ postsDir }));
  return app;
}

function startServer() {
  return createApp().listen(port, () => {
    console.log(`kernel-notes listening on :${port} with archive/history support`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
  readManifest,
  resolveHistorySlug,
  tagUrl,
  filterPostsByTag,
  versionFooter,
  decoratePostHtml,
  renderTagIndex
};