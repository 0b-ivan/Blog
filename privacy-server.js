const express = require('express');
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

function stripExternalFontLinks(html) {
  return html
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*\/?>/g, '')
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"[^>]*>/g, '')
    .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/g, '');
}

function localizeBrowserDependencies(html) {
  return stripExternalFontLinks(html)
    .replace(
      'https://cdn.jsdelivr.net/npm/medium-zoom@1.1.0/dist/medium-zoom.min.js',
      '/vendor/medium-zoom/medium-zoom.min.js'
    )
    .replace(
      'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
      '/vendor/mermaid/mermaid.esm.min.mjs'
    )
    .replace(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css',
      '/vendor/highlight/styles/github-dark.min.css'
    )
    .replace(
      'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js',
      '/vendor/highlight/highlight.min.js'
    );
}

function addPrivacyNavigation(html) {
  if (html.includes('href="/datenschutz"') || html.includes('href="datenschutz.html"')) {
    return html;
  }

  let output = html
    .replace(
      '<a href="/impressum">Impressum</a>',
      '<a href="/datenschutz">Datenschutz</a>\n        <a href="/impressum">Impressum</a>'
    )
    .replace(
      '<a href="impressum.html">Impressum</a>',
      '<a href="datenschutz.html">Datenschutz</a>\n        <a href="impressum.html">Impressum</a>'
    );

  output = output.replace(
    '<p><a class="read-more" href="/impressum">Zum Impressum</a></p>',
    '<p><a class="read-more" href="/datenschutz">Zum Datenschutz</a></p>\n        <p><a class="read-more" href="/impressum">Zum Impressum</a></p>'
  );

  return output;
}

function hardenHtml(html) {
  return addPrivacyNavigation(localizeBrowserDependencies(html));
}

function vendorStatic(relativePath) {
  return express.static(path.join(nodeModules, relativePath), {
    fallthrough: false,
    index: false,
    immutable: true,
    maxAge: '365d'
  });
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

  app.use((req, res, next) => {
    if (BLOCKED_PATHS.some((pattern) => pattern.test(req.path))) {
      res.status(404).type('text').send('Not found');
      return;
    }
    next();
  });

  app.get(['/datenschutz', '/datenschutz.html'], (_req, res) => {
    res.sendFile(path.join(root, 'datenschutz.html'));
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
  addPrivacyNavigation,
  hardenHtml,
  createApp,
  startServer
};
