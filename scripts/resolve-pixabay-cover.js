const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { URL } = require('node:url');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');
const PIXABAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PIXABAY_LICENSE = 'Pixabay Content License';
const PIXABAY_LICENSE_URL = 'https://pixabay.com/service/license-summary/';

function parseArgs(args) {
  const options = { target: '', query: '', select: 0, preview: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (!arg.startsWith('--') && !options.target) options.target = arg;
    else if (arg === '--query' && next) { options.query = next.trim(); i += 1; }
    else if (arg === '--select' && next) { options.select = Number.parseInt(next, 10); i += 1; }
    else if (arg === '--preview') options.preview = true;
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  return options;
}

function normalizedTags(data) {
  return Array.isArray(data.tags)
    ? data.tags.map((value) => String(value || '').trim()).filter(Boolean)
    : String(data.tags || '').split(',').map((value) => value.trim()).filter(Boolean);
}

function defaultQuery(data) {
  const explicit = String(data.cover_query || '').trim();
  if (explicit) return explicit.slice(0, 100);

  const tags = normalizedTags(data).slice(0, 3);
  const topicQuery = [...tags, data.category]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);

  return topicQuery || String(data.title || '').trim().slice(0, 100);
}

function queryCandidates(data, explicitQuery = '') {
  const tags = normalizedTags(data);
  const primary = String(explicitQuery || defaultQuery(data)).trim().slice(0, 100);
  const fallback = [data.category, ...tags.slice(0, 2)]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);
  const title = String(data.title || '').trim().slice(0, 100);

  return [...new Set([primary, fallback, title].filter(Boolean))].slice(0, 3);
}

async function searchPixabay(query, apiKey, fetchImpl = globalThis.fetch) {
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');
  url.searchParams.set('per_page', '6');
  url.searchParams.set('min_width', '1280');
  url.searchParams.set('min_height', '720');

  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Pixabay search failed with HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.hits) ? payload.hits : [];
}

function cacheFileForQuery(query, cacheDir = path.join(root, '.cache', 'pixabay')) {
  const digest = crypto.createHash('sha256').update(String(query)).digest('hex').slice(0, 24);
  return path.join(cacheDir, `${digest}.json`);
}

async function searchPixabayCached(query, apiKey, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cacheDir = options.cacheDir || path.join(root, '.cache', 'pixabay');
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const cacheFile = cacheFileForQuery(query, cacheDir);

  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    const age = now - Number(cached.cachedAt || 0);
    if (age >= 0 && age < PIXABAY_CACHE_TTL_MS && Array.isArray(cached.hits)) {
      return cached.hits;
    }
  } catch (error) {
    if (!error || (error.code !== 'ENOENT' && error.name !== 'SyntaxError')) throw error;
  }

  const hits = await searchPixabay(query, apiKey, fetchImpl);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify({ cachedAt: now, query, hits }, null, 2), 'utf8');
  return hits;
}

function renderCandidates(hits) {
  return hits.map((hit, index) => {
    const author = hit.user || 'unknown';
    const tags = hit.tags || 'untitled';
    const page = hit.pageURL || '';
    const preview = hit.previewURL || hit.webformatURL || '';
    return [
      `### ${index + 1}. ${tags}`,
      `- Fotograf: ${author}`,
      `- Pixabay: ${page}`,
      `- Vorschau: ${preview}`
    ].join('\n');
  }).join('\n\n');
}

async function choosePhoto(hits, selectedIndex) {
  if (!hits.length) throw new Error('No Pixabay images matched the query');
  if (selectedIndex > 0) {
    if (selectedIndex > hits.length) {
      throw new Error(`Selected Pixabay candidate ${selectedIndex} is unavailable; received ${hits.length} result(s)`);
    }
    return hits[selectedIndex - 1];
  }

  const rl = readline.createInterface({ input, output });
  try {
    hits.forEach((hit, index) => {
      output.write(`\n${index + 1}. ${hit.tags || 'untitled'}\n   by ${hit.user || 'unknown'}\n   ${hit.pageURL}\n`);
    });
    const answer = await rl.question(`\nSelect [1-${hits.length}]: `);
    const index = Number.parseInt(answer, 10);
    if (!Number.isInteger(index) || index < 1 || index > hits.length) throw new Error('Invalid selection');
    return hits[index - 1];
  } finally {
    rl.close();
  }
}

function contributorUrl(hit) {
  if (!hit.user || !hit.user_id) return 'https://pixabay.com/';
  return `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`;
}

function fileExtension(url, contentType) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (/\.png$/.test(pathname) || /png/i.test(contentType)) return 'png';
  if (/\.webp$/.test(pathname) || /webp/i.test(contentType)) return 'webp';
  return 'jpg';
}

async function downloadPhoto(hit, fetchImpl = globalThis.fetch) {
  const sourceUrl = hit.largeImageURL || hit.webformatURL;
  if (!sourceUrl) throw new Error('Pixabay result has no downloadable image URL');

  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== 'https:') throw new Error('Pixabay image URL must use HTTPS');

  const response = await fetchImpl(sourceUrl);
  if (!response.ok) throw new Error(`Pixabay image download failed with HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType)) {
    throw new Error(`Unexpected Pixabay image content type: ${contentType}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
    sourceUrl
  };
}

async function updateCoverStylesheet(slug, coverImage, focus = 'center') {
  const stylesheetPath = path.join(root, 'assets', 'css', 'article-covers.css');
  let css = '';
  try {
    css = await fs.readFile(stylesheetPath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  const safeSlug = String(slug).replace(/[^a-zA-Z0-9._-]/g, '');
  const safeFocus = ['center', 'top', 'bottom', 'left', 'right'].includes(focus) ? focus : 'center';
  const start = `/* cover:${safeSlug}:start */`;
  const end = `/* cover:${safeSlug}:end */`;
  const rule = `${start}
.post-page[data-post-slug="${safeSlug}"] .article-hero {
  --article-cover-image: url("${coverImage}");
  --article-cover-focus: ${safeFocus};
}
${end}`;

  const blockPattern = new RegExp(
    `/\\* cover:${safeSlug}:start \\*/[\\s\\S]*?/\\* cover:${safeSlug}:end \\*/`,
    'm'
  );
  css = blockPattern.test(css)
    ? css.replace(blockPattern, rule)
    : `${css.trimEnd()}\n\n${rule}\n`;

  await fs.mkdir(path.dirname(stylesheetPath), { recursive: true });
  await fs.writeFile(stylesheetPath, css, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.target) throw new Error('Usage: npm run covers:resolve -- posts/<post>.md [--query "..."] [--select 1]');

  const apiKey = String(process.env.PIXABAY_API_KEY || '').trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY is required');

  const postsRoot = path.resolve(root, 'posts');
  const target = path.resolve(root, options.target);
  if (!target.startsWith(`${postsRoot}${path.sep}`)) throw new Error('Target must be inside posts/');

  const raw = await fs.readFile(target, 'utf8');
  const parsed = matter(raw);
  const queries = queryCandidates(parsed.data, options.query);
  if (!queries.length) throw new Error('Could not derive a Pixabay cover query');

  let query = queries[0];
  let hits = [];
  for (const candidate of queries) {
    console.log(`Searching Pixabay for: ${candidate}`);
    hits = await searchPixabayCached(candidate, apiKey);
    if (hits.length) {
      query = candidate;
      break;
    }
  }

  if (!hits.length) throw new Error(`No Pixabay images matched: ${queries.join(' | ')}`);

  if (options.preview) {
    console.log(renderCandidates(hits));
    return;
  }

  const hit = await choosePhoto(hits, options.select);
  const downloaded = await downloadPhoto(hit);

  const slug = path.basename(target, '.md');
  const ext = fileExtension(downloaded.sourceUrl, downloaded.contentType);
  const coverImage = `/assets/covers/${slug}.${ext}`;
  const coverPath = path.join(root, coverImage.replace(/^\//, ''));

  await fs.mkdir(path.dirname(coverPath), { recursive: true });
  await fs.writeFile(coverPath, downloaded.buffer);

  const updated = matter.stringify(parsed.content, {
    ...parsed.data,
    cover_query: query,
    cover_provider: 'pixabay',
    cover_provider_id: String(hit.id),
    cover_image: coverImage,
    cover_alt: hit.tags || `Cover for ${parsed.data.title || slug}`,
    cover_focus: 'center',
    cover_credit: `by ${hit.user || 'Pixabay contributor'} via Pixabay`,
    cover_credit_url: hit.pageURL || contributorUrl(hit),
    cover_source_url: hit.pageURL || 'https://pixabay.com/',
    cover_license: PIXABAY_LICENSE,
    cover_license_url: PIXABAY_LICENSE_URL
  });
  await fs.writeFile(target, updated, 'utf8');
  await updateCoverStylesheet(slug, coverImage, 'center');

  console.log(`Saved ${path.relative(root, coverPath)} from Pixabay image ${hit.id}`);
  console.log('Updated assets/css/article-covers.css');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { PIXABAY_CACHE_TTL_MS, PIXABAY_LICENSE, PIXABAY_LICENSE_URL, cacheFileForQuery, defaultQuery, downloadPhoto, fileExtension, parseArgs, queryCandidates, renderCandidates, searchPixabay, searchPixabayCached, updateCoverStylesheet };
