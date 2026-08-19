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
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
      const slug = slugify(file.name);
      const title = parsed.data.title || slug;
      const date = parsed.data.date || '1970-01-01';
      const category = parsed.data.category || 'IT';
      const tags = normalizeTags(parsed.data.tags);
      const excerpt = parsed.data.excerpt || excerptFromBody(parsed.content);
      const markdownContent = transformWikiLinks(parsed.content);

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
    <link rel="stylesheet" href="/styles.css" />
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
      </nav>
    </header>

    <main>
      <article class="post-page">
        <p class="meta">${meta}</p>
        <h1>${post.title}</h1>
        ${tagsHtml ? `<div class="tag-list" aria-label="Tags">${tagsHtml}</div>` : ''}
        <section class="terminal-post" aria-label="Terminal article view">
          <div class="terminal-chrome">
            <button class="terminal-dot terminal-dot-red" type="button" data-terminal-action="overview" aria-label="Zurueck zur Uebersicht"></button>
            <button class="terminal-dot terminal-dot-yellow" type="button" data-terminal-action="restore" aria-label="Terminal wiederherstellen"></button>
            <button class="terminal-dot terminal-dot-green" type="button" data-terminal-action="maximize" aria-label="Terminal maximieren"></button>
            <p class="terminal-title">live-terminal://kernel-notes/${post.title}</p>
          </div>
          <div class="post-content terminal-content">${post.html}</div>
        </section>
        <p><a class="read-more" href="/">Zurueck zur Startseite</a></p>
      </article>
    </main>
    <script src="/script.js"></script>
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
      const post = posts.find((item) => item.slug === req.params.slug);

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
  readPosts,
  renderPostPage
};
