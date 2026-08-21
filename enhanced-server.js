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

function injectAfterTitle(html, markup) {
  return html.replace(/(<h1>[^]*?<\/h1>)/, `$1\n        ${markup}`);
}

function versionBar(slug, manifest, options = {}) {
  if (!manifest || !manifest.currentVersion) {
    return '';
  }

  const currentVersion = Number(manifest.currentVersion);
  const viewingVersion = options.viewingVersion ? Number(options.viewingVersion) : currentVersion;
  const archived = manifest.status === 'archived';
  const currentUrl = archived ? `/archive/${slug}` : `/posts/${slug}`;
  const historical = viewingVersion !== currentVersion;

  return `<aside class="post-version-bar" aria-label="Artikelversion">
          <span>${historical ? 'Historische ' : ''}Version <strong>v${viewingVersion}</strong></span>
          <a href="/history/${slug}">Versionsverlauf</a>
          ${historical ? `<a href="${currentUrl}">Aktuelle Version v${currentVersion}</a>` : ''}
          ${archived ? '<span class="archive-badge">Archiviert</span>' : ''}
        </aside>`;
}

function decoratePostHtml(html, slug, manifest, options = {}) {
  let output = addHistoryStyles(addArchiveNavigation(html));
  const bar = versionBar(slug, manifest, options);
  if (bar) {
    output = injectAfterTitle(output, bar);
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
  </head>
  <body>
    <div class="bg-grid" aria-hidden="true"></div>
    <header class="site-header">
      <a class="logo" href="/">Kernel Notes</a>
      <nav class="main-nav" aria-label="Hauptnavigation">
        <a href="/#posts">Artikel</a>
        <a href="/#topics">Themen</a>
        <a href="/snippets/">Snippets</a>
        <a href="/archive">Archiv</a>
        <a href="/#about">About</a>
        <a href="/impressum">Impressum</a>
      </nav>
    </header>
    <main class="history-page">${body}</main>
  </body>
</html>`;
}

async function renderArchiveIndex() {
  const posts = await legacy.readPosts(archiveDir);
  if (!posts.length) {
    return pageShell('Archiv', '<section class="history-panel"><p class="eyebrow">Archiv</p><h1>Archivierte Artikel</h1><p>Noch keine Artikel archiviert.</p></section>');
  }

  const cards = await Promise.all(posts.map(async (post) => {
    const manifest = await readManifest(post.slug);
    const tags = legacy.normalizeTags(post.tags).slice(0, 10)
      .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
      .join('');
    return `<a class="archive-card" href="/archive/${post.slug}">
      <p class="meta">${escapeHtml(post.category)} · ${escapeHtml(post.date)}${manifest?.currentVersion ? ` · v${manifest.currentVersion}` : ''}</p>
      <h2>${escapeHtml(post.title)}</h2>
      <p>${escapeHtml(post.excerpt)}</p>
      ${tags ? `<div class="tag-list">${tags}</div>` : ''}
    </a>`;
  }));

  return pageShell('Archiv', `<section class="history-panel"><p class="eyebrow">Archiv</p><h1>Archivierte Artikel</h1><p>Diese Beiträge sind nicht mehr in der normalen Artikelliste, bleiben aber dauerhaft lesbar.</p><div class="archive-grid">${cards.join('')}</div></section>`);
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
  versionBar,
  decoratePostHtml
};
