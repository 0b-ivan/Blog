const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const legacy = require('./server');
const {
  buildPdfPublication,
  pdfMetadata
} = require('./lib/latex-export');

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 8092);
const root = __dirname;
const postsDir = process.env.POSTS_DIR || path.join(root, 'posts');
const template = process.env.PDF_LATEX_TEMPLATE || path.join(root, 'templates', 'paper.tex');
const compileTimeoutMs = Number(process.env.PDF_COMPILE_TIMEOUT_MS || 60000);
const defaultPdfCacheMaxEntries = 4;

let runtimeCheck;
let pdfBuildTail = Promise.resolve();
const pdfCache = new Map();
const pdfPending = new Map();

function pdfCacheMaxEntries() {
  const configured = Number.parseInt(
    String(process.env.PDF_CACHE_MAX_ENTRIES ?? defaultPdfCacheMaxEntries),
    10
  );
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : defaultPdfCacheMaxEntries;
}

function enqueuePdfBuild(task) {
  const run = pdfBuildTail
    .catch(() => undefined)
    .then(task);

  pdfBuildTail = run.catch(() => undefined);
  return run;
}

function pdfCacheKey(post) {
  return [
    String(post?.slug || ''),
    String(post?.version || 1),
    String(post?.updatedAt || post?.date || '')
  ].join(':');
}

function pdfRenderState(post) {
  const key = pdfCacheKey(post);
  return {
    key,
    ready: pdfCache.has(key),
    preparing: pdfPending.has(key)
  };
}

function rememberPdf(post, pdf) {
  const key = pdfCacheKey(post);
  const slugPrefix = `${String(post?.slug || '')}:`;

  for (const existingKey of pdfCache.keys()) {
    if (existingKey.startsWith(slugPrefix) && existingKey !== key) {
      pdfCache.delete(existingKey);
    }
  }

  const maxEntries = pdfCacheMaxEntries();
  if (maxEntries <= 0) return pdf;

  pdfCache.delete(key);
  pdfCache.set(key, pdf);

  while (pdfCache.size > maxEntries) {
    const oldestKey = pdfCache.keys().next().value;
    pdfCache.delete(oldestKey);
  }

  return pdf;
}

function prepareArticlePdf(post, options = {}) {
  const state = pdfRenderState(post);
  if (state.ready) {
    const cached = pdfCache.get(state.key);
    pdfCache.delete(state.key);
    pdfCache.set(state.key, cached);
    return Promise.resolve(cached);
  }
  if (state.preparing) {
    return pdfPending.get(state.key);
  }

  const compileImpl = options.compileImpl || compileArticlePdf;
  const queuedAt = Date.now();
  const pending = enqueuePdfBuild(async () => {
    const startedAt = Date.now();
    console.log(`PDF render started for ${post.slug} after ${startedAt - queuedAt}ms queued`);
    try {
      const pdf = await compileImpl(post);
      console.log(`PDF render ready for ${post.slug} in ${Date.now() - startedAt}ms`);
      return rememberPdf(post, pdf);
    } catch (error) {
      console.error(`PDF render failed for ${post.slug} after ${Date.now() - startedAt}ms`);
      throw error;
    }
  }).finally(() => {
    pdfPending.delete(state.key);
  });

  pdfPending.set(state.key, pending);
  return pending;
}

async function verifyRuntime() {
  if (!runtimeCheck) {
    runtimeCheck = Promise.all([
      execFileAsync('pandoc', ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 }),
      execFileAsync('lualatex', ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 }),
      execFileAsync('rsvg-convert', ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 })
    ]).then(() => true);
  }
  return runtimeCheck;
}

async function prepareSvgImagesForPdf(html, tempDir, options = {}) {
  const execImpl = options.execImpl || execFileAsync;
  const assetRoot = path.resolve(options.assetRoot || root, 'assets');
  const sources = [...new Set(
    [...String(html || '').matchAll(/\bsrc="([^"]+\.svg)"/gi)]
      .map((match) => match[1])
      .filter((src) => {
        const absolute = path.resolve(src);
        return absolute.startsWith(`${assetRoot}${path.sep}`);
      })
  )];

  let prepared = String(html || '');

  for (const [index, source] of sources.entries()) {
    const output = path.join(tempDir, `article-image-${index + 1}.png`);
    await execImpl('rsvg-convert', [
      '--format',
      'png',
      '--output',
      output,
      source
    ], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });

    prepared = prepared
      .split(`src="${source}"`)
      .join(`src="${output}"`);
  }

  return prepared;
}

async function compileArticlePdf(post) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-latex-'));
  const inputFile = path.join(tempDir, 'article.html');
  const outputFile = path.join(tempDir, 'article.pdf');

  try {
    const publication = await buildPdfPublication(post, { assetRoot: root });
    const preparedHtml = await prepareSvgImagesForPdf(publication.html, tempDir, { assetRoot: root });
    await fs.writeFile(inputFile, preparedHtml, 'utf8');

    const metadata = pdfMetadata(post, {
      assetRoot: root,
      siteUrl: process.env.SITE_URL || 'https://blog.obivan.org'
    });
    const metadataFile = path.join(tempDir, 'metadata.json');
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');

    const args = [
      inputFile,
      '--from=html',
      '--to=pdf',
      '--pdf-engine=lualatex',
      `--template=${template}`,
      '--number-sections',
      '--listings',
      `--resource-path=${[root, path.join(root, 'assets'), path.join(root, 'snippets')].join(':')}`,
      `--metadata-file=${metadataFile}`,
      '--pdf-engine-opt=-interaction=nonstopmode',
      '--pdf-engine-opt=-halt-on-error',
      '--pdf-engine-opt=-file-line-error',
      '--output',
      outputFile
    ];

    await execFileAsync('pandoc', args, {
      cwd: tempDir,
      timeout: compileTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        LANG: process.env.LANG || 'C.UTF-8',
        LC_ALL: process.env.LC_ALL || 'C.UTF-8'
      }
    });

    const pdf = await fs.readFile(outputFile);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('LuaLaTeX renderer did not produce a PDF');
    }
    return pdf;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', async (_req, res) => {
    try {
      await verifyRuntime();
      res.type('text').send('ok');
    } catch (error) {
      console.error(error);
      res.status(503).type('text').send('latex runtime unavailable');
    }
  });

  app.get('/status/:slug', async (req, res) => {
    try {
      const posts = await legacy.readPosts(postsDir);
      const post = legacy.resolvePostBySlug(posts, req.params.slug);

      if (!post) {
        res.status(404).json({ ready: false, preparing: false, message: 'Post not found' });
        return;
      }

      const state = pdfRenderState(post);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({
        ready: state.ready,
        preparing: state.preparing
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ ready: false, preparing: false });
    }
  });

  app.post('/prepare/:slug', async (req, res) => {
    try {
      await verifyRuntime();
      const posts = await legacy.readPosts(postsDir);
      const post = legacy.resolvePostBySlug(posts, req.params.slug);

      if (!post) {
        res.status(404).json({ ready: false, preparing: false, message: 'Post not found' });
        return;
      }

      const state = pdfRenderState(post);
      if (state.ready) {
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ ready: true, preparing: false });
        return;
      }

      void prepareArticlePdf(post).catch((error) => {
        console.error(error);
      });

      res.set('Cache-Control', 'no-store');
      res.status(202).json({ ready: false, preparing: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ ready: false, preparing: false });
    }
  });

  app.get('/pdf/:slug', async (req, res) => {
    try {
      await verifyRuntime();
      const posts = await legacy.readPosts(postsDir);
      const post = legacy.resolvePostBySlug(posts, req.params.slug);

      if (!post) {
        res.status(404).type('text').send('Post not found');
        return;
      }

      const pdf = await prepareArticlePdf(post);
      res.set('Content-Type', 'application/pdf');
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).send(pdf);
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not render LaTeX PDF');
    }
  });

  return app;
}

function startServer() {
  return createApp().listen(port, () => {
    console.log(`kernel-notes LaTeX renderer listening on :${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  compileArticlePdf,
  pdfCacheKey,
  pdfCacheMaxEntries,
  pdfRenderState,
  prepareArticlePdf,
  prepareSvgImagesForPdf,
  createApp,
  startServer,
  verifyRuntime
};
