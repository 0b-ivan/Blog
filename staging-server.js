const express = require('express');
const seo = require('./seo-server');

const port = process.env.PORT || 8080;

function injectStagingMarker(html) {
  const source = String(html || '');
  if (!/(?:<!doctype html|<html\b)/i.test(source)) {
    return html;
  }

  let output = source;

  if (!/data-environment=["']staging["']/i.test(output)) {
    output = output.replace(/<html\b([^>]*)>/i, '<html$1 data-environment="staging">');
  }

  if (!/data-staging-style/i.test(output)) {
    output = output.replace(
      '</head>',
      '    <link rel="stylesheet" href="/assets/css/staging.css" data-staging-style />\n  </head>'
    );
  }

  if (!/class=["'][^"']*staging-banner/i.test(output)) {
    output = output.replace(
      /<body\b([^>]*)>/i,
      '<body$1>\n    <div class="staging-banner" role="status" aria-label="Staging environment">STAGING</div>'
    );
  }

  return output;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string') {
        return originalSend(injectStagingMarker(body));
      }
      return originalSend(body);
    };
    next();
  });

  app.use(seo.createApp());
  return app;
}

function startServer() {
  return createApp().listen(port, () => {
    console.log(`kernel-notes staging listening on :${port} with visual staging marker`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  injectStagingMarker,
  createApp,
  startServer
};
