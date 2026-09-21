const { URL } = require('node:url');

function analyticsServiceTarget(pathname, baseUrl = process.env.ANALYTICS_SERVICE_URL || 'http://analytics:8080') {
  const target = new URL(baseUrl);
  const requested = new URL(String(pathname || '/'), 'http://analytics.internal');
  target.pathname = requested.pathname;
  target.search = requested.search;
  return target;
}

module.exports = { analyticsServiceTarget };
