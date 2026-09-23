const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const legacy = require('./server');
const {
  buildPdfHtml,
  pandocMetadataArgs,
  pdfMetadata
} = require('./lib/latex-export');

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 8092);
const root = __dirname;
const postsDir = process.env.POSTS_DIR || path.join(root, 'posts');
const template = process.env.PDF_LATEX_TEMPLATE || path.join(root, 'templates', 'paper.tex');
const compileTimeoutMs = Number(process.env.PDF_COMPILE_TIMEOUT_MS || 60000);

let runtimeCheck;

async function verifyRuntime() {
  if (!runtimeCheck) {
    runtimeCheck = Promise.all([
      execFileAsync('pandoc', ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 }),
      execFileAsync('lualatex', ['--version'], { timeout: 5000, maxBuffer: 1024 * 1024 })
    ]).then(() => true);
  }
  return runtimeCheck;
}

async function compileArticlePdf(post) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-latex-'));
  const inputFile = path.join(tempDir, 'article.html');
  const outputFile = path.join(tempDir, 'article.pdf');

  try {
    const html = await buildPdfHtml(post, { assetRoot: root });
    await fs.writeFile(inputFile, html, 'utf8');

    const metadata = pdfMetadata(post, {
      assetRoot: root,
      siteUrl: process.env.SITE_URL || 'https://blog.obivan.org'
    });

    const args = [
      inputFile,
      '--from=html',
      '--to=pdf',
      '--pdf-engine=lualatex',
      `--template=${template}`,
      '--number-sections',
      '--listings',
      `--resource-path=${[root, path.join(root, 'assets'), path.join(root, 'snippets')].join(':')}`,
      '--pdf-engine-opt=-interaction=nonstopmode',
      '--pdf-engine-opt=-halt-on-error',
      '--pdf-engine-opt=-file-line-error',
      ...pandocMetadataArgs(metadata),
      '--output',
      outputFile
    ];

    await execFileAsync('pandoc', args, {
      cwd: tempDir,
      timeout: compileTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH || '0'
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

  app.get('/pdf/:slug', async (req, res) => {
    try {
      await verifyRuntime();
      const posts = await legacy.readPosts(postsDir);
      const post = legacy.resolvePostBySlug(posts, req.params.slug);

      if (!post) {
        res.status(404).type('text').send('Post not found');
        return;
      }

      const pdf = await compileArticlePdf(post);
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
  createApp,
  startServer,
  verifyRuntime
};
