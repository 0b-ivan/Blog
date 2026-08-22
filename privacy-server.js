const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const enhanced = require('./enhanced-server');

const port = process.env.PORT || 8080;
const root = __dirname;
const nodeModules = path.join(root, 'node_modules');

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

const BLOCKED_PATHS = [
  /^\/node_modules(?:\/|$)/,
  /^\/\.git(?:\/|$)/,
  /^\/\.github(?:\/|$)/,
  /^\/config(?:\/|$)/,
  /^\/e2e(?:\/|$)/,
  /^\/tests(?:\/|$)/,
  /^\/scripts(?:\/|$)/,
  /^\/post-history(?:\/|$)/,
  /^\/package(?:-lock)?\.json$/,
  /^\/server\.js$/,
  /^\/enhanced-server\.js$/,
  /^\/privacy-server\.js$/,
  /^\/Dockerfile$/,
  /^\/docker-compose(?:\.[^/]+)?\.ya?ml$/,
  /^\/eslint\.config\.cjs$/,
  /^\/VERSION$/,
  /^\/posts\/.*\.md$/,
  /^\/archive\/.*\.md$/
];

const FOOTER_META_LINKS = [
  '<a href="/about">About</a>',
  '<a href="/datenschutz">Datenschutz</a>',
  '<a href="/impressum">Impressum</a>'
].join('\n        ');

const META_LINK_PATTERN = /\s*<a\b[^>]*href="(?:#about|\/#about|index\.html#about|\/about|about\.html|\/datenschutz|datenschutz\.html|\/impressum|impressum\.html)"[^>]*>(?:About|Datenschutz|Impressum)<\/a>/gi;

function stripExternalFontLinks(html) {
  return html
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*\/?>/g, '')
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"[^>]*>/g, '')
    .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/g, '');
}

function localizeBrowserDependencies(html) {
  return stripExternalFontLinks(html)
    .replaceAll(
      'https://cdn.jsdelivr.net/npm/medium-zoom@1.1.0/dist/medium-zoom.min.js',
      '/vendor/medium-zoom/medium-zoom.min.js'
    )
    .replaceAll(
      'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
      '/vendor/mermaid/mermaid.esm.min.mjs'
    )
    .replaceAll(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css',
      '/vendor/highlight/styles/github-dark.min.css'
    )
    .replaceAll(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js',
      '/vendor/highlight/highlight.min.js'
    )
    .replaceAll(
      '/node_modules/markdown-it/dist/browser/markdown-it.umd.min.js',
      '/vendor/markdown-it/markdown-it.umd.min.js'
    );
}

function localizeClientScript(source) {
  return source
    .replaceAll(
      'https://cdn.jsdelivr.net/npm/force-graph@1.51.4/dist/force-graph.min.js',
      '/vendor/force-graph/force-graph.min.js'
    )
    .replaceAll(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/styles/github-dark.min.css',
      '/vendor/highlight/styles/github-dark.min.css'
    )
    .replaceAll(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/highlight.min.js',
      '/vendor/highlight/highlight.min.js'
    );
}

function stripMetaLinks(fragment) {
  return fragment.replace(META_LINK_PATTERN, '');
}

function moveMetaNavigationToFooter(html) {
  let output = html.replace(
    /(<nav\b[^>]*class="[^"]*\bmain-nav\b[^"]*"[^>]*>)([\s\S]*?)(<\/nav>)/gi,
    (_match, openingTag, navigation, closingTag) => `${openingTag}${stripMetaLinks(navigation)}${closingTag}`
  );

  output = output
    .replace(/\s*<p><a class="read-more" href="\/datenschutz">Zum Datenschutz<\/a><\/p>/gi, '')
    .replace(/\s*<p><a class="read-more" href="\/impressum">Zum Impressum<\/a><\/p>/gi, '');

  let footerFound = false;
  output = output.replace(
    /(<footer\b[^>]*class="[^"]*\bsite-footer\b[^"]*"[^>]*>)([\s\S]*?)(<\/footer>)/gi,
    (_match, openingTag, footerContent, closingTag) => {
      footerFound = true;
      const cleanedFooter = stripMetaLinks(footerContent);

      if (/class="[^"]*\bfooter-links\b[^"]*"/i.test(cleanedFooter)) {
        const withMetaLinks = cleanedFooter.replace(
          /(<div\b[^>]*class="[^"]*\bfooter-links\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i,
          (_linksMatch, linksOpeningTag, links, linksClosingTag) =>
            `${linksOpeningTag}${links.trimEnd()}\n        ${FOOTER_META_LINKS}\n      ${linksClosingTag}`
        );
        return `${openingTag}${withMetaLinks}${closingTag}`;
      }

      return `${openingTag}${cleanedFooter}\n      <div class="footer-links">\n        ${FOOTER_META_LINKS}\n      </div>\n    ${closingTag}`;
    }
  );

  if (!footerFound) {
    output = output.replace(
      '</body>',
      `    <footer class="site-footer">\n      <p>© 2026 Kernel Notes</p>\n      <div class="footer-links">\n        ${FOOTER_META_LINKS}\n      </div>\n    </footer>\n  </body>`
    );
  }

  return output;
}

function addPrivacyNavigation(html) {
  return moveMetaNavigationToFooter(html);
}

function hardenHtml(html) {
  return moveMetaNavigationToFooter(localizeBrowserDependencies(html));
}

function vendorStatic(relativePath) {
  return express.static(path.join(nodeModules, relativePath), {
    fallthrough: false,
    index: false,
    immutable: true,
    maxAge: '365d'
  });
}

async function sendHardenedHtml(res, fileName) {
  const html = await fs.readFile(path.join(root, fileName), 'utf8');
  res.type('html').send(hardenHtml(html));
}

async function sendLocalizedScript(res, fileName) {
  const source = await fs.readFile(path.join(root, fileName), 'utf8');
  res.type('application/javascript').send(localizeClientScript(source));
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    res.removeHeader('X-Powered-By');
    next();
  });

  app.use('/vendor/markdown-it', vendorStatic('markdown-it/dist/browser'));
  app.use('/vendor/force-graph', vendorStatic('force-graph/dist'));
  app.use('/vendor/medium-zoom', vendorStatic('medium-zoom/dist'));
  app.use('/vendor/mermaid', vendorStatic('mermaid/dist'));
  app.use('/vendor/highlight', vendorStatic('@highlightjs/cdn-assets'));

  app.get('/script.js', async (_req, res) => {
    try {
      await sendLocalizedScript(res, 'script.js');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load script');
    }
  });

  app.get('/assets/knowledge-graph.js', async (_req, res) => {
    try {
      const source = await fs.readFile(path.join(root, 'assets', 'knowledge-graph.js'), 'utf8');
      res.type('application/javascript').send(localizeClientScript(source));
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load graph script');
    }
  });

  app.get(['/index.html'], async (_req, res) => {
    try {
      await sendHardenedHtml(res, 'index.html');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load page');
    }
  });

  app.get(['/about', '/about.html'], async (_req, res) => {
    try {
      await sendHardenedHtml(res, 'about.html');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load about page');
    }
  });

  app.get(['/impressum', '/impressum.html'], async (_req, res) => {
    try {
      await sendHardenedHtml(res, 'impressum.html');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load legal notice');
    }
  });

  app.get(['/roadmap', '/roadmap.html'], async (_req, res) => {
    try {
      await sendHardenedHtml(res, 'roadmap.html');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load roadmap');
    }
  });

  app.get(['/snippets', '/snippets/', '/snippets/index.html'], async (_req, res) => {
    try {
      const html = await fs.readFile(path.join(root, 'snippets', 'index.html'), 'utf8');
      res.type('html').send(hardenHtml(html));
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load snippets');
    }
  });

  app.get(['/datenschutz', '/datenschutz.html'], async (_req, res) => {
    try {
      await sendHardenedHtml(res, 'datenschutz.html');
    } catch (error) {
      console.error(error);
      res.status(500).type('text').send('Could not load privacy notice');
    }
  });

  app.use((req, res, next) => {
    if (BLOCKED_PATHS.some((pattern) => pattern.test(req.path))) {
      res.status(404).type('text').send('Not found');
      return;
    }
    next();
  });

  app.use((_req, res, next) => {
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string' && /(?:<!doctype html|<html\b)/i.test(body)) {
        return originalSend(hardenHtml(body));
      }
      return originalSend(body);
    };
    next();
  });

  app.use(enhanced.createApp());
  return app;
}

function startServer() {
  return createApp().listen(port, () => {
    console.log(`kernel-notes listening on :${port} with privacy hardening`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  SECURITY_HEADERS,
  BLOCKED_PATHS,
  stripExternalFontLinks,
  localizeBrowserDependencies,
  localizeClientScript,
  stripMetaLinks,
  moveMetaNavigationToFooter,
  addPrivacyNavigation,
  hardenHtml,
  createApp,
  startServer
};
