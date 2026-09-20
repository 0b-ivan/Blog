const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const port = Number.parseInt(process.env.PORT || '8080', 10);
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(__dirname, '.data', 'analytics');
const dataFile = path.join(dataDir, 'analytics.json');
const retentionDays = Math.max(7, Math.min(365, Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90', 10)));
const dashboardToken = process.env.ANALYTICS_DASHBOARD_TOKEN || crypto.randomBytes(24).toString('base64url');

function emptyState() {
  return { version: 1, articles: {}, daily: {} };
}

function safeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,159}$/.test(slug) ? slug : '';
}

function safeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function boundedNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (parsed?.version === 1 && parsed.articles && parsed.daily) return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('analytics state load failed:', error.message || error);
  }
  return emptyState();
}

fs.mkdirSync(dataDir, { recursive: true });
let state = loadState();
let persistQueue = Promise.resolve();
let persistSequence = 0;

function articleBucket(root, slug) {
  root[slug] ||= {
    views: 0,
    activeSeconds: 0,
    completions: 0,
    likes: 0,
    scroll25: 0,
    scroll50: 0,
    scroll75: 0,
    scroll90: 0,
    scroll100: 0
  };
  return root[slug];
}

function dayBucket(date = today()) {
  state.daily[date] ||= { articles: {}, searches: {} };
  return state.daily[date];
}

function pruneDaily() {
  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() - (retentionDays - 1));
  const minimum = threshold.toISOString().slice(0, 10);
  for (const date of Object.keys(state.daily)) {
    if (date < minimum) delete state.daily[date];
  }
}

function persist() {
  pruneDaily();
  const snapshot = JSON.stringify(state);
  const sequence = ++persistSequence;
  persistQueue = persistQueue
    .then(async () => {
      const temporary = `${dataFile}.tmp-${process.pid}-${sequence}`;
      await fsp.writeFile(temporary, snapshot, 'utf8');
      await fsp.rename(temporary, dataFile);
    })
    .catch((error) => console.error('analytics state persist failed:', error.message || error));
}

function recordArticle(slug, type, payload) {
  const allTime = articleBucket(state.articles, slug);
  const daily = articleBucket(dayBucket().articles, slug);
  const buckets = [allTime, daily];

  if (type === 'article_view') {
    buckets.forEach((bucket) => { bucket.views += 1; });
  } else if (type === 'article_active') {
    const seconds = boundedNumber(payload.seconds, 1, 60);
    buckets.forEach((bucket) => { bucket.activeSeconds += seconds; });
  } else if (type === 'article_scroll') {
    const percent = boundedNumber(payload.percent, 0, 100);
    const key = percent >= 100 ? 'scroll100'
      : percent >= 90 ? 'scroll90'
        : percent >= 75 ? 'scroll75'
          : percent >= 50 ? 'scroll50'
            : percent >= 25 ? 'scroll25'
              : '';
    if (key) buckets.forEach((bucket) => { bucket[key] += 1; });
    if (percent >= 90 && payload.completed === true) {
      buckets.forEach((bucket) => { bucket.completions += 1; });
    }
  } else {
    return false;
  }

  persist();
  return true;
}

function recordSearch(payload) {
  const source = ['grep-page', 'grep-overlay'].includes(payload.source) ? payload.source : '';
  const query = safeQuery(payload.query);
  if (!source || query.length < 2) return false;

  const normalized = query.toLocaleLowerCase('de-DE');
  const searches = dayBucket().searches;
  searches[normalized] ||= { query, searches: 0, zeroResults: 0, clicks: 0 };
  const bucket = searches[normalized];

  if (payload.type === 'search') {
    bucket.searches += 1;
    if (boundedNumber(payload.resultCount, 0, 100) === 0) bucket.zeroResults += 1;
  } else if (payload.type === 'search_click') {
    bucket.clicks += 1;
  } else {
    return false;
  }

  persist();
  return true;
}

function articleMetrics(slug) {
  const bucket = state.articles[slug] || articleBucket({}, slug);
  return {
    views: bucket.views,
    averageActiveSeconds: bucket.views ? Math.round(bucket.activeSeconds / bucket.views) : 0,
    completionRate: bucket.views ? Math.round((bucket.completions / bucket.views) * 100) : 0,
    likes: bucket.likes
  };
}

function dateRange(days) {
  const count = Math.max(1, Math.min(retentionDays, Number.parseInt(days || '30', 10)));
  const result = [];
  const cursor = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() - offset);
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

function summary(daysValue) {
  const dates = dateRange(daysValue);
  const articles = {};
  const searches = {};
  const trend = [];

  for (const date of dates) {
    const day = state.daily[date] || { articles: {}, searches: {} };
    let dayViews = 0;
    let daySearches = 0;

    for (const [slug, values] of Object.entries(day.articles || {})) {
      const bucket = articleBucket(articles, slug);
      for (const key of Object.keys(bucket)) bucket[key] += Number(values[key] || 0);
      dayViews += Number(values.views || 0);
    }

    for (const [key, values] of Object.entries(day.searches || {})) {
      searches[key] ||= { query: values.query || key, searches: 0, zeroResults: 0, clicks: 0 };
      searches[key].searches += Number(values.searches || 0);
      searches[key].zeroResults += Number(values.zeroResults || 0);
      searches[key].clicks += Number(values.clicks || 0);
      daySearches += Number(values.searches || 0);
    }

    trend.push({ date, views: dayViews, searches: daySearches });
  }

  const articleRows = Object.entries(articles).map(([slug, bucket]) => ({
    slug,
    views: bucket.views,
    averageActiveSeconds: bucket.views ? Math.round(bucket.activeSeconds / bucket.views) : 0,
    completionRate: bucket.views ? Math.round((bucket.completions / bucket.views) * 100) : 0,
    likes: bucket.likes
  })).sort((a, b) => b.views - a.views || a.slug.localeCompare(b.slug));

  const allSearchRows = Object.values(searches)
    .sort((a, b) => b.searches - a.searches || a.query.localeCompare(b.query, 'de'));
  const searchRows = allSearchRows.slice(0, 20);

  const totals = articleRows.reduce((acc, item) => {
    acc.views += item.views;
    acc.activeSeconds += (articles[item.slug]?.activeSeconds || 0);
    acc.completions += (articles[item.slug]?.completions || 0);
    return acc;
  }, { views: 0, activeSeconds: 0, completions: 0 });

  const searchTotals = allSearchRows.reduce((acc, item) => {
    acc.searches += item.searches;
    acc.zeroResults += item.zeroResults;
    acc.clicks += item.clicks;
    return acc;
  }, { searches: 0, zeroResults: 0, clicks: 0 });

  return {
    days: dates.length,
    totals: {
      views: totals.views,
      averageActiveSeconds: totals.views ? Math.round(totals.activeSeconds / totals.views) : 0,
      completionRate: totals.views ? Math.round((totals.completions / totals.views) * 100) : 0,
      searches: searchTotals.searches,
      searchCtr: searchTotals.searches ? Math.round((searchTotals.clicks / searchTotals.searches) * 100) : 0,
      zeroResultRate: searchTotals.searches ? Math.round((searchTotals.zeroResults / searchTotals.searches) * 100) : 0
    },
    topArticles: articleRows.slice(0, 20),
    topSearches: searchRows,
    contentGaps: allSearchRows.filter((item) => item.zeroResults > 0)
      .sort((a, b) => b.zeroResults - a.zeroResults)
      .slice(0, 12),
    trend
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) req.destroy(new Error('payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function dashboardAuthorized(req) {
  const supplied = String(req.headers['x-analytics-token'] || '');
  if (!supplied || supplied.length !== dashboardToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(dashboardToken));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function createServer() {
  return http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://analytics.internal');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/summary') {
    if (!dashboardAuthorized(req)) {
      sendJson(res, 401, { error: 'analytics_dashboard_auth_required' });
      return;
    }
    sendJson(res, 200, summary(url.searchParams.get('days')));
    return;
  }

  const articleMatch = url.pathname.match(/^\/article\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && articleMatch) {
    const slug = safeSlug(articleMatch[1]);
    if (!slug) return sendJson(res, 400, { error: 'invalid_slug' });
    sendJson(res, 200, articleMetrics(slug));
    return;
  }

  const likeMatch = url.pathname.match(/^\/like\/([a-z0-9-]+)$/);
  if (req.method === 'POST' && likeMatch) {
    const slug = safeSlug(likeMatch[1]);
    if (!slug) return sendJson(res, 400, { error: 'invalid_slug' });
    const allTime = articleBucket(state.articles, slug);
    const daily = articleBucket(dayBucket().articles, slug);
    allTime.likes += 1;
    daily.likes += 1;
    persist();
    sendJson(res, 200, articleMetrics(slug));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    try {
      const payload = await readJson(req);
      const type = String(payload.type || '');
      const slug = safeSlug(payload.slug);
      const accepted = type.startsWith('article_')
        ? Boolean(slug && recordArticle(slug, type, payload))
        : recordSearch(payload);
      sendJson(res, accepted ? 202 : 400, accepted ? { accepted: true } : { error: 'invalid_event' });
    } catch (_error) {
      sendJson(res, 400, { error: 'invalid_json' });
    }
    return;
  }

    sendJson(res, 404, { error: 'not_found' });
  });
}

async function flushPersistence() {
  await persistQueue;
}

function startServer() {
  return createServer().listen(port, '0.0.0.0', () => {
    console.log(`kernel-notes analytics listening on :${port}`);
    if (!process.env.ANALYTICS_DASHBOARD_TOKEN) {
      console.log(`analytics dashboard token: ${dashboardToken}`);
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  safeSlug,
  safeQuery,
  boundedNumber,
  articleMetrics,
  summary,
  flushPersistence,
  createServer,
  startServer
};
