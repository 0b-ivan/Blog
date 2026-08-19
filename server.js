const express = require('express');
const fs = require('node:fs/promises');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const mdFootnote = require('markdown-it-footnote');
const mdContainer = require('markdown-it-container');

const port = process.env.PORT || 8080;
const root = __dirname;

function getPostsDir(explicitPostsDir) {
  return explicitPostsDir || process.env.POSTS_DIR || path.join(root, 'posts');
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
  const knownKeys = new Set(['id', 'version', 'title', 'date', 'created_at', 'updated_at', 'author', 'reviewed_by', 'category', 'excerpt', 'tags']);

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
  typographer: true
});

md.use(mdFootnote);

function transformWikiLinks(content) {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const cleanTarget = String(target || '').trim();
    const cleanLabel = String(label || cleanTarget).trim();
    const slug = slugFromWikiName(cleanTarget);

    if (!slug) {
      return cleanLabel;
    }

    return `[${cleanLabel}](/posts/${slug})`;
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

async function readPosts(explicitPostsDir) {
  const postsDir = getPostsDir(explicitPostsDir);
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
      const category = recovered.data.category || 'IT';
      const tags = normalizeTags(recovered.data.tags);
      const excerpt = recovered.data.excerpt || excerptFromBody(recovered.content);
      const markdownContent = transformWikiLinks(recovered.content);

      return {
        slug,
        title,
        date,
        category,
        tags,
        excerpt,
        html: md.render(markdownContent)
      };
    })
  );

  posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  return posts;
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

function renderPostPage(post) {
  const meta = `${post.category} · ${post.date}`;
  const tagsHtml = (post.tags || [])
    .slice(0, 2)
    .map((tag) => `<span class="tag-chip">${tag}</span>`)
    .join('');

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${post.title} | Kernel Notes</title>
    <meta name="description" content="${post.excerpt}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css?v=20260819-2" />
    <link rel="stylesheet" href="/image-viewer.css?v=20260819-3" />
  </head>
  <body class="post-detail">
    <div class="bg-grid" aria-hidden="true"></div>
    <div class="bg-radial bg-radial-1" aria-hidden="true"></div>
    <div class="bg-radial bg-radial-2" aria-hidden="true"></div>

    <header class="site-header">
      <a class="logo" href="/">Kernel Notes</a>
      <nav class="main-nav" aria-label="Hauptnavigation">
        <a href="/#posts">Artikel</a>
        <a href="/#topics">Themen</a>
        <a href="/#about">About</a>
        <a href="/impressum">Impressum</a>
      </nav>
    </header>

    <main>
      <article class="post-page">
        <p class="meta">${meta}</p>
        <h1>${post.title}</h1>
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

  app.use('/assets', express.static(path.join(root, 'assets')));
  app.use(express.static(root, { extensions: ['html'] }));

  app.get('/api/legal-info', (_req, res) => {
    res.json(getLegalInfo());
  });

  app.get('/api/posts', async (_req, res) => {
    try {
      const posts = await readPosts(postsDir);
      const dto = posts.map(({ slug, title, date, category, tags, excerpt }) => ({
        slug,
        title,
        date,
        category,
        tags,
        excerpt
      }));
      res.json(dto);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Could not load posts' });
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

      res.type('html').send(renderPostPage(post));
    } catch (error) {
      console.error(error);
      res.status(500).send('Could not render post');
    }
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  app.get('*', (_req, res) => {
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
  slugify,
  excerptFromBody,
  parseDate,
  normalizeTags,
  slugFromWikiName,
  inferDateFromSlug,
  recoverMetadata,
  resolvePostBySlug,
  getLegalInfo,
  readPosts,
  renderPostPage
};