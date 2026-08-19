const express = require('express');
const fs = require('node:fs/promises');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

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
      const excerpt = parsed.data.excerpt || excerptFromBody(parsed.content);

      return {
        slug,
        title,
        date,
        category,
        excerpt,
        html: marked.parse(parsed.content)
      };
    })
  );

  posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  return posts;
}

function renderPostPage(post) {
  const meta = `${post.category} · ${post.date}`;

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
  <body>
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
        <div class="post-content">${post.html}</div>
        <p><a class="read-more" href="/">Zurueck zur Startseite</a></p>
      </article>
    </main>
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
      const dto = posts.map(({ slug, title, date, category, excerpt }) => ({
        slug,
        title,
        date,
        category,
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
  readPosts,
  renderPostPage
};
