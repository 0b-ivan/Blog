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

const DEFAULT_AVOID_TERMS = [
  'people', 'person', 'portrait', 'woman', 'women', 'man', 'men', 'girl', 'boy',
  'meeting', 'handshake', 'teamwork', 'businessman', 'businesswoman', 'smile', 'smiling'
];

const WEAK_DIRECT_TERMS = new Set([
  'architecture', 'deployment', 'engineering', 'operations'
]);

const TOPIC_AVOID = {
  kubernetes: ['train', 'railway', 'railroad', 'locomotive', 'mongolia'],
  k3s: ['train', 'railway', 'railroad', 'locomotive', 'mongolia'],
  proxmox: ['train', 'railway', 'railroad', 'locomotive', 'mongolia'],
  docker: ['ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight'],
  compose: ['ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight'],
  devops: ['soldier', 'army', 'military', 'weapon', 'war', 'patrol', 'afghanistan'],
  gitops: ['soldier', 'army', 'military', 'weapon', 'war', 'patrol', 'afghanistan']
};

const VISUAL_INTENTS = [
  {
    key: 'writing-proofreading',
    markers: ['legasthenie', 'rechtschreib', 'cspell', 'languagetool', 'proofread', 'spelling', 'grammar'],
    query: 'writing proofreading text document keyboard spelling grammar',
    positive: ['writing', 'text', 'document', 'keyboard', 'spelling', 'grammar', 'proofreading', 'editing', 'words', 'typewriter'],
    avoid: ['secretary', 'office', 'telephone', 'call', 'sales', 'robot', 'robotics', 'factory', 'business']
  },
  {
    key: 'rss-reader',
    markers: ['freshrss', 'miniflux', 'rss', 'feed'],
    query: 'rss feed news articles newspaper website subscription',
    positive: ['rss', 'feed', 'news', 'article', 'newspaper', 'subscription', 'website'],
    avoid: ['book', 'books', 'bookstore', 'library', 'novel', 'novels', 'server', 'rack', 'datacenter', 'storage', 'hard drive', 'disk', 'database']
  },
  {
    key: 'dependency-updates',
    markers: ['dependabot', 'dependency', 'dependencies', 'supply-chain', 'supply chain'],
    query: 'software dependency package update code github vulnerability',
    positive: ['dependency', 'dependencies', 'package', 'update', 'software', 'code', 'github', 'vulnerability'],
    avoid: ['safe', 'vault', 'lock', 'padlock', 'key', 'insurance']
  },
  {
    key: 'systemd-service',
    markers: ['systemd', 'journalctl'],
    query: 'linux command line shell service logs daemon code',
    positive: ['linux', 'service', 'logs', 'administration', 'shell', 'command', 'daemon', 'code'],
    avoid: ['game', 'gaming', 'playstation', 'controller', 'xbox', 'sony', 'train', 'subway', 'station', 'airport', 'vehicle', 'transport', 'ambulance', 'html', 'css', 'website', 'web design']
  },
  {
    key: 'docker-compose',
    markers: ['docker compose', 'docker', 'compose'],
    query: 'devops software code terminal deployment programming',
    positive: ['software', 'code', 'deployment', 'devops', 'development', 'programming', 'terminal'],
    avoid: ['container', 'box', 'jar', 'can', 'vessel', 'urn', 'storage', 'ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight']
  },
  {
    key: 'semantic-search',
    markers: ['semantic-search', 'semantic search', 'kernel grep', 'embeddings', 'duckdb'],
    query: 'search data code analytics magnifying glass',
    positive: ['search', 'data', 'code', 'magnifying', 'analytics', 'embedding'],
    minMatches: 2,
    avoid: ['robot', 'human', 'person', 'google', 'smartphone', 'mobile phone', 'telephone', 'container', 'box', 'jar']
  },
  {
    key: 'vpc-networking',
    markers: ['vpc', 'subnet', 'route-table', 'route table', 'nat-gateway', 'internet-gateway'],
    query: 'computer network topology router routing subnet infrastructure',
    positive: ['topology', 'router', 'routing', 'subnet', 'infrastructure', 'ethernet'],
    minMatches: 2,
    avoid: ['social media', 'icons', 'online', 'smartphone', 'database', 'storage', 'rack', 'datacenter']
  },
  {
    key: 'chaos-engineering',
    markers: ['chaos-engineering', 'chaos engineering', 'chaos monkey', 'blast radius', 'steady state', 'resilience'],
    query: 'server monitoring dashboard alert outage infrastructure reliability',
    positive: ['server', 'monitoring', 'dashboard', 'alert', 'outage', 'infrastructure', 'reliability', 'incident', 'observability'],
    minMatches: 2,
    avoid: ['touch', 'finger', 'school', 'university', 'exam', 'examination', 'chemistry', 'chemical', 'laboratory', 'medical', 'business', 'management', 'sales', 'marketing']
  },
  {
    key: 'regression-testing',
    markers: ['regressionstest', 'regression test', 'regression'],
    query: 'software testing quality assurance bug code',
    positive: ['testing', 'test', 'quality', 'assurance', 'bug', 'software', 'code'],
    avoid: ['business', 'meeting', 'office']
  },
  {
    key: 'logging-observability',
    markers: ['logger.info', 'logging', 'logger', 'observability'],
    query: 'server logs monitoring dashboard metrics observability cloudwatch',
    positive: ['logs', 'logging', 'monitoring', 'dashboard', 'metrics', 'observability', 'cloudwatch', 'alerts'],
    avoid: ['smartphone', 'photography', 'binary', 'game', 'gaming', 'business', 'meeting', 'office']
  },
  {
    key: 'photo-storage-sync',
    markers: ['immich', 'nextcloud', 'webdav', 'rclone'],
    query: 'photo gallery cloud files sync digital images',
    positive: ['photo', 'gallery', 'files', 'sync', 'cloud', 'image', 'digital'],
    minMatches: 2,
    avoid: ['warehouse', 'mini storage', 'self storage', 'music', 'business', 'meeting', 'office']
  }
];

const TOPIC_EXPANSIONS = {
  kubernetes: ['server', 'datacenter', 'infrastructure', 'network', 'cloud', 'container', 'cluster'],
  k3s: ['kubernetes', 'server', 'cluster', 'infrastructure', 'datacenter'],
  proxmox: ['server', 'virtualization', 'datacenter', 'infrastructure', 'cluster'],
  devops: ['server', 'deployment', 'automation', 'infrastructure', 'cloud', 'terminal'],
  gitops: ['deployment', 'automation', 'infrastructure', 'cloud', 'server'],
  immich: ['photo', 'storage', 'server', 'cloud', 'gallery'],
  nextcloud: ['storage', 'cloud', 'server', 'files', 'sync'],
  webdav: ['storage', 'server', 'files', 'sync', 'cloud'],
  rclone: ['storage', 'files', 'sync', 'cloud', 'server'],
  'self-hosting': ['server', 'homelab', 'storage', 'network', 'infrastructure'],
  selfhosting: ['server', 'homelab', 'storage', 'network', 'infrastructure'],
  aws: ['cloud', 'server', 'network', 'datacenter', 'infrastructure'],
  vpc: ['network', 'cloud', 'infrastructure', 'datacenter'],
  cloudflare: ['network', 'cloud', 'security', 'server'],
  waf: ['security', 'firewall', 'network', 'protection'],
  security: ['security', 'lock', 'shield', 'firewall', 'protection'],
  hardening: ['security', 'server', 'lock', 'protection'],
  dependabot: ['code', 'security', 'software', 'dependency', 'automation'],
  docker: ['container', 'server', 'deployment', 'software', 'terminal'],
  compose: ['container', 'server', 'deployment', 'software'],
  rss: ['feed', 'news', 'reader', 'web'],
  freshrss: ['feed', 'news', 'reader', 'server'],
  systemd: ['linux', 'terminal', 'server', 'service'],
  linux: ['terminal', 'server', 'code', 'computer'],
  regression: ['testing', 'software', 'code', 'automation', 'quality'],
  testing: ['testing', 'software', 'code', 'automation', 'quality'],
  logging: ['server', 'terminal', 'monitoring', 'software', 'code'],
  logger: ['server', 'terminal', 'monitoring', 'software', 'code'],
  search: ['search', 'data', 'code', 'network'],
  semantic: ['search', 'data', 'ai', 'code'],
  blog: ['website', 'code', 'server', 'publishing']
};

const STOP_WORDS = new Set([
  'aber', 'als', 'auf', 'aus', 'bei', 'bin', 'bis', 'das', 'dem', 'den', 'der', 'die', 'ein',
  'eine', 'einen', 'einer', 'eines', 'fur', 'für', 'gegen', 'ich', 'im', 'in', 'ist', 'kein',
  'keine', 'mein', 'meine', 'mit', 'nicht', 'oder', 'statt', 'teil', 'und', 'vom', 'von',
  'warum', 'was', 'wie', 'zu', 'zum', 'zur', 'the', 'and', 'for', 'from', 'into', 'with',
  'without', 'part', 'using', 'use'
]);

function parseArgs(args) {
  const options = { target: '', query: '', select: 0, selectId: '', preview: false, report: '' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (!arg.startsWith('--') && !options.target) options.target = arg;
    else if (arg === '--query' && next) { options.query = next.trim(); i += 1; }
    else if (arg === '--select' && next) { options.select = Number.parseInt(next, 10); i += 1; }
    else if (arg === '--select-id' && next) { options.selectId = String(next).trim(); i += 1; }
    else if (arg === '--report' && next) { options.report = next.trim(); i += 1; }
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function tokensFrom(value) {
  return normalizeText(value)
    .split(/[^a-z0-9+#-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function listFrom(value) {
  if (Array.isArray(value)) return value.flatMap((item) => tokensFrom(item));
  return String(value || '').split(/[,;]+/).flatMap((item) => tokensFrom(item));
}

function markerMatches(value, markers) {
  const haystack = normalizeText(value);
  if (!haystack) return [];

  return markers.filter((marker) => haystack.includes(normalizeText(marker)));
}

function visualIntentEvidence(data, intent) {
  const searchQueries = Array.isArray(data.search_queries)
    ? data.search_queries.map((entry) => typeof entry === 'string' ? entry : entry?.query).filter(Boolean)
    : [];

  const sources = [
    { value: data.cover_subject, weight: 12 },
    { value: data.title, weight: 10 },
    { value: normalizedTags(data).join(' '), weight: 4 },
    { value: data.category, weight: 3 },
    { value: data.excerpt, weight: 2 },
    { value: searchQueries.join(' '), weight: 1 }
  ];

  let evidenceScore = 0;
  const matchedMarkers = new Set();

  for (const source of sources) {
    for (const marker of markerMatches(source.value, intent.markers)) {
      evidenceScore += source.weight;
      matchedMarkers.add(marker);
    }
  }

  return {
    evidenceScore,
    matchedMarkers: [...matchedMarkers]
  };
}

function visualIntent(data = {}) {
  const matches = VISUAL_INTENTS
    .map((intent) => ({
      ...intent,
      ...visualIntentEvidence(data, intent)
    }))
    .filter((intent) => intent.evidenceScore >= Number(intent.minEvidence || 6))
    .sort((left, right) => {
      if (right.evidenceScore !== left.evidenceScore) {
        return right.evidenceScore - left.evidenceScore;
      }
      if (right.matchedMarkers.length !== left.matchedMarkers.length) {
        return right.matchedMarkers.length - left.matchedMarkers.length;
      }

      const rightSpecificity = right.matchedMarkers.reduce((sum, marker) => sum + marker.length, 0);
      const leftSpecificity = left.matchedMarkers.reduce((sum, marker) => sum + marker.length, 0);
      return rightSpecificity - leftSpecificity;
    });

  return matches[0] || null;
}


function seriesSlug(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function detectSeries(data = {}) {
  const explicit = String(data.series || '').trim();
  if (explicit) return seriesSlug(explicit);

  const title = String(data.title || '').trim();
  const match = title.match(/^(.*?)\s+[–—-]\s+(?:teil|part)\s+(?:[ivxlcdm]+|\d+)\b/i);
  return match ? seriesSlug(match[1]) : '';
}

function defaultQuery(data) {
  const explicit = String(data.cover_query || '').trim();
  if (explicit) return explicit.slice(0, 100);

  const subject = String(data.cover_subject || '').trim();
  const tags = normalizedTags(data).slice(0, 3);
  const topicQuery = [subject, ...tags, data.category]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);

  return topicQuery || String(data.title || '').trim().slice(0, 100);
}

function visualQuery(data) {
  const sourceTokens = new Set([
    ...tokensFrom(data.cover_subject),
    ...tokensFrom(data.cover_query),
    ...normalizedTags(data).flatMap(tokensFrom),
    ...tokensFrom(data.category),
    ...tokensFrom(data.title)
  ]);

  const visualTerms = [];
  for (const token of sourceTokens) {
    for (const related of TOPIC_EXPANSIONS[token] || []) {
      if (!visualTerms.includes(related)) visualTerms.push(related);
    }
  }

  return visualTerms.slice(0, 8).join(' ').slice(0, 100);
}

function queryCandidates(data, explicitQuery = '') {
  const tags = normalizedTags(data);
  const intent = visualIntent(data);
  const primary = String(explicitQuery || defaultQuery(data)).trim().slice(0, 100);
  const visual = visualQuery(data);
  const fallback = [data.cover_subject, data.category, ...tags.slice(0, 2)]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);
  const title = String(data.title || '').trim().slice(0, 100);

  const candidates = explicitQuery
    ? (intent
      ? [primary, intent.query, visual || fallback]
      : [primary, visual, fallback])
    : (intent
      ? [intent.query, primary, visual || fallback]
      : [primary, visual, fallback]);

  if (!intent && !visual && title) candidates.push(title);

  return [...new Set(candidates.filter(Boolean).map((value) => String(value).slice(0, 100)))].slice(0, 3);
}

function articleProfile(data, query = '') {
  const intent = visualIntent(data);
  const primary = new Set([
    ...tokensFrom(data.cover_subject),
    ...tokensFrom(data.cover_query),
    ...normalizedTags(data).flatMap(tokensFrom),
    ...tokensFrom(data.category),
    ...tokensFrom(data.title),
    ...tokensFrom(query)
  ]);

  const expanded = new Set();
  for (const token of primary) {
    for (const related of TOPIC_EXPANSIONS[token] || []) expanded.add(related);
  }

  const contextualAvoid = [];
  for (const token of primary) {
    contextualAvoid.push(...(TOPIC_AVOID[token] || []));
  }

  const avoid = new Set([
    ...DEFAULT_AVOID_TERMS,
    ...contextualAvoid,
    ...(intent?.avoid || []),
    ...listFrom(data.cover_avoid)
  ].flatMap((value) => tokensFrom(value)));

  const intentPositive = new Set((intent?.positive || []).flatMap((value) => tokensFrom(value)));
  const intentAvoid = new Set((intent?.avoid || []).flatMap((value) => tokensFrom(value)));

  return { primary, expanded, avoid, intent, intentPositive, intentAvoid };
}

function scoreHit(hit, data = {}, query = '') {
  const profile = articleProfile(data, query);
  const hitTokens = new Set(tokensFrom(hit.tags));
  let score = 28;
  const reasons = [];

  const directMatches = [...hitTokens].filter(
    (token) => profile.primary.has(token) && !WEAK_DIRECT_TERMS.has(token)
  );
  const expandedMatches = [...hitTokens].filter((token) => !profile.primary.has(token) && profile.expanded.has(token));
  const avoidMatches = [...hitTokens].filter((token) => profile.avoid.has(token));
  const intentMatches = [...hitTokens].filter((token) => profile.intentPositive.has(token));
  const intentAvoidMatches = [...hitTokens].filter((token) => profile.intentAvoid.has(token));

  if (profile.intent) {
    const minIntentMatches = Math.max(1, Number(profile.intent.minMatches || 1));
    if (intentMatches.length >= minIntentMatches) {
      const points = Math.min(42, intentMatches.length * 14);
      score += points;
      reasons.push(`+${points} visual intent (${profile.intent.key}): ${intentMatches.slice(0, 4).join(', ')}`);
    } else {
      score -= 35;
      reasons.push(`-35 visual intent mismatch: ${profile.intent.key} (${intentMatches.length}/${minIntentMatches})`);
    }

    if (intentAvoidMatches.length) {
      const points = Math.min(54, intentAvoidMatches.length * 18);
      score -= points;
      reasons.push(`-${points} intent avoid: ${intentAvoidMatches.slice(0, 3).join(', ')}`);
    }
  }

  if (directMatches.length) {
    const points = Math.min(36, directMatches.length * 12);
    score += points;
    reasons.push(`+${points} direct: ${directMatches.slice(0, 4).join(', ')}`);
  }

  if (expandedMatches.length) {
    const points = Math.min(20, expandedMatches.length * 5);
    score += points;
    reasons.push(`+${points} topic: ${expandedMatches.slice(0, 4).join(', ')}`);
  }

  if (avoidMatches.length) {
    const points = Math.min(60, avoidMatches.length * 22);
    score -= points;
    reasons.push(`-${points} avoid: ${avoidMatches.slice(0, 3).join(', ')}`);
  }

  if (!directMatches.length && !expandedMatches.length) {
    score -= 22;
    reasons.push('-22 no topical match');
  }

  const width = Number(hit.imageWidth || hit.webformatWidth || 0);
  const height = Number(hit.imageHeight || hit.webformatHeight || 0);
  const ratio = width > 0 && height > 0 ? width / height : 0;

  if (ratio >= 1.45 && ratio <= 2.25) {
    score += 10;
    reasons.push('+10 hero aspect');
  } else if (ratio >= 1.2) {
    score += 4;
    reasons.push('+4 landscape');
  } else if (ratio > 0) {
    score -= 6;
    reasons.push('-6 weak aspect');
  }

  if (width >= 1920) {
    score += 5;
    reasons.push('+5 resolution');
  } else if (width >= 1280) {
    score += 3;
    reasons.push('+3 resolution');
  }

  const popularity = Math.log10(Math.max(1, Number(hit.downloads || 0) + Number(hit.likes || 0) * 10));
  const popularityPoints = Math.min(5, Math.max(0, Math.round(popularity)));
  if (popularityPoints) {
    score += popularityPoints;
    reasons.push(`+${popularityPoints} popularity`);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    directMatches,
    expandedMatches,
    avoidMatches,
    intentKey: profile.intent?.key || '',
    intentMatches,
    intentAvoidMatches,
    semanticMismatch: Boolean(
      profile.intent && intentMatches.length < Math.max(1, Number(profile.intent.minMatches || 1))
    )
  };
}

function rankCandidates(hits, data = {}, query = '') {
  return hits
    .map((hit) => ({ hit, ...scoreHit(hit, data, query) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightPopularity = Number(right.hit.downloads || 0) + Number(right.hit.likes || 0);
      const leftPopularity = Number(left.hit.downloads || 0) + Number(left.hit.likes || 0);
      return rightPopularity - leftPopularity;
    });
}

async function searchPixabay(query, apiKey, fetchImpl = globalThis.fetch) {
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');
  url.searchParams.set('per_page', '20');
  url.searchParams.set('min_width', '1280');
  url.searchParams.set('min_height', '720');

  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Pixabay search failed with HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.hits) ? payload.hits : [];
}

function cacheFileForQuery(query, cacheDir = path.join(root, '.cache', 'pixabay')) {
  const digest = crypto.createHash('sha256').update(`v2:${String(query)}`).digest('hex').slice(0, 24);
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

async function collectCandidates(queries, apiKey, options = {}) {
  const searchImpl = options.searchImpl || searchPixabayCached;
  const byId = new Map();

  for (const query of queries) {
    console.log(`Searching Pixabay for: ${query}`);
    const hits = await searchImpl(query, apiKey, options.searchOptions || {});

    for (const hit of hits) {
      const key = String(hit.id || hit.pageURL || hit.webformatURL || '');
      if (!key) continue;

      const existing = byId.get(key);
      if (existing) {
        const paths = new Set([...(existing.__coverQueries || []), query]);
        existing.__coverQueries = [...paths];
        continue;
      }

      byId.set(key, {
        ...hit,
        __coverQuery: query,
        __coverQueries: [query]
      });
    }
  }

  return [...byId.values()];
}

function cleanInline(value) {
  return String(value || '').replace(/[\r\n|]+/g, ' ').trim();
}

function renderCandidates(ranked, limit = 6) {
  return ranked.slice(0, limit).map((entry, index) => {
    const hit = entry.hit;
    const author = cleanInline(hit.user || 'unknown');
    const tags = cleanInline(hit.tags || 'untitled');
    const page = hit.pageURL || '';
    const preview = hit.previewURL || hit.webformatURL || '';
    const searchPaths = (hit.__coverQueries || [hit.__coverQuery]).filter(Boolean).join(' · ');
    return [
      `### ${index + 1}. Score ${entry.score}/100 — ${tags}`,
      preview ? `![Kandidat ${index + 1}](${preview})` : '',
      `- Fotograf: ${author}`,
      searchPaths ? `- Suchpfad: ${searchPaths}` : '',
      `- Pixabay: ${page}`,
      `- Bewertung: ${entry.reasons.join(' · ') || 'keine zusätzlichen Signale'}`
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function findPhotoById(hits, selectedId) {
  const id = String(selectedId || '').trim();
  if (!id) throw new Error('Pixabay image id is required');

  const hit = hits.find((candidate) => String(candidate.id) === id);
  if (!hit) {
    throw new Error(`Selected Pixabay image id ${id} is unavailable in the current ranked candidate pool`);
  }
  return hit;
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

async function removeStaleCoverVariants(slug, keepExtension) {
  const coverDir = path.join(root, 'assets', 'covers');
  for (const extension of ['jpg', 'png', 'webp']) {
    if (extension === keepExtension) continue;
    try {
      await fs.unlink(path.join(coverDir, `${slug}.${extension}`));
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
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

function reportCandidate(entry, index) {
  const hit = entry.hit;
  return {
    rank: index + 1,
    id: String(hit.id || ''),
    score: entry.score,
    tags: hit.tags || '',
    user: hit.user || '',
    pageURL: hit.pageURL || '',
    previewURL: hit.previewURL || hit.webformatURL || '',
    searchQuery: hit.__coverQuery || '',
    searchQueries: hit.__coverQueries || (hit.__coverQuery ? [hit.__coverQuery] : []),
    intentKey: entry.intentKey || '',
    intentMatches: entry.intentMatches || [],
    semanticMismatch: Boolean(entry.semanticMismatch),
    reasons: entry.reasons
  };
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const absolute = path.resolve(reportPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.target) throw new Error('Usage: npm run covers:resolve -- posts/<post>.md [--query "..."] [--select 1 | --select-id 123] [--report /tmp/report.json]');

  const apiKey = String(process.env.PIXABAY_API_KEY || '').trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY is required');

  const postsRoot = path.resolve(root, 'posts');
  const target = path.resolve(root, options.target);
  if (!target.startsWith(`${postsRoot}${path.sep}`)) throw new Error('Target must be inside posts/');

  const raw = await fs.readFile(target, 'utf8');
  const parsed = matter(raw);
  const queries = queryCandidates(parsed.data, options.query);
  if (!queries.length) throw new Error('Could not derive a Pixabay cover query');

  const hits = await collectCandidates(queries, apiKey);
  if (!hits.length) throw new Error(`No Pixabay images matched: ${queries.join(' | ')}`);

  const rankingQuery = String(options.query || queries[0] || '').trim();
  const ranked = rankCandidates(hits, parsed.data, rankingQuery);
  const reportBase = {
    postPath: options.target,
    title: parsed.data.title || path.basename(target, '.md'),
    series: detectSeries(parsed.data),
    visualIntent: visualIntent(parsed.data)?.key || '',
    visualIntentEvidence: visualIntent(parsed.data)?.evidenceScore || 0,
    query: rankingQuery,
    queries,
    candidates: ranked.slice(0, 5).map(reportCandidate)
  };

  if (options.preview) {
    console.log(renderCandidates(ranked));
    await writeReport(options.report, reportBase);
    return;
  }

  const rankedHits = ranked.map((entry) => entry.hit);
  let hit;
  if (options.selectId) {
    hit = findPhotoById(rankedHits, options.selectId);
  } else {
    hit = await choosePhoto(rankedHits, options.select);
  }
  const selectedIndex = rankedHits.findIndex((candidate) => String(candidate.id) === String(hit.id));
  const selectedEntry = ranked[Math.max(0, selectedIndex)];
  const downloaded = await downloadPhoto(hit);

  const slug = path.basename(target, '.md');
  const ext = fileExtension(downloaded.sourceUrl, downloaded.contentType);
  const coverImage = `/assets/covers/${slug}.${ext}`;
  const coverPath = path.join(root, coverImage.replace(/^\//, ''));

  await fs.mkdir(path.dirname(coverPath), { recursive: true });
  await removeStaleCoverVariants(slug, ext);
  await fs.writeFile(coverPath, downloaded.buffer);

  const updated = matter.stringify(parsed.content, {
    ...parsed.data,
    cover_query: hit.__coverQuery || queries[0],
    cover_provider: 'pixabay',
    cover_provider_id: String(hit.id),
    cover_image: coverImage,
    cover_alt: hit.tags || `Cover for ${parsed.data.title || slug}`,
    cover_focus: 'center',
    cover_score: selectedEntry.score,
    cover_credit: `by ${hit.user || 'Pixabay contributor'} via Pixabay`,
    cover_credit_url: hit.pageURL || contributorUrl(hit),
    cover_source_url: hit.pageURL || 'https://pixabay.com/',
    cover_license: PIXABAY_LICENSE,
    cover_license_url: PIXABAY_LICENSE_URL
  });
  await fs.writeFile(target, updated, 'utf8');
  await updateCoverStylesheet(slug, coverImage, 'center');

  await writeReport(options.report, {
    ...reportBase,
    selected: {
      ...reportCandidate(selectedEntry, Math.max(0, selectedIndex)),
      coverImage
    }
  });

  console.log(`Selected Pixabay image ${hit.id} at ranked candidate ${selectedIndex + 1} with score ${selectedEntry.score}/100`);
  console.log(`Saved ${path.relative(root, coverPath)} from Pixabay image ${hit.id}`);
  console.log('Updated assets/css/article-covers.css');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_AVOID_TERMS,
  PIXABAY_CACHE_TTL_MS,
  PIXABAY_LICENSE,
  PIXABAY_LICENSE_URL,
  TOPIC_EXPANSIONS,
  VISUAL_INTENTS,
  articleProfile,
  cacheFileForQuery,
  choosePhoto,
  collectCandidates,
  defaultQuery,
  detectSeries,
  downloadPhoto,
  fileExtension,
  findPhotoById,
  parseArgs,
  queryCandidates,
  visualIntent,
  visualIntentEvidence,
  visualQuery,
  rankCandidates,
  renderCandidates,
  scoreHit,
  searchPixabay,
  searchPixabayCached,
  updateCoverStylesheet
};
