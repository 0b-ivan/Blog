const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { URL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');
const PIXABAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PIXABAY_LICENSE = 'Pixabay Content License';
const PIXABAY_LICENSE_URL = 'https://pixabay.com/service/license-summary/';

const HERO_MIN_WIDTH = 1600;
const HERO_MIN_HEIGHT = 900;
const HERO_MIN_ASPECT = 1.25;
const HERO_MAX_ASPECT = 2.6;
const HARD_LOGO_TERMS = new Set(['logo', 'logotype', 'pictogram', 'emblem']);
const SYMBOL_LIKE_TERMS = new Set(['icon', 'symbol', 'button', 'badge', 'sign', 'isolated']);

const DEFAULT_AVOID_TERMS = [
  'people', 'person', 'portrait', 'woman', 'women', 'man', 'men', 'girl', 'boy',
  'meeting', 'handshake', 'teamwork', 'businessman', 'businesswoman', 'smile', 'smiling'
];

const WEAK_DIRECT_TERMS = new Set([
  'architecture', 'deployment', 'engineering', 'operations'
]);

const GENERIC_SUBJECT_CONTEXT_TERMS = new Set([
  'article', 'blog', 'technical', 'technology', 'software', 'programming', 'code',
  'engineering', 'architecture', 'system', 'service', 'application', 'automation',
  'game', 'gaming', 'retro', 'handheld', 'console', 'battle', 'combat', 'fight',
  'creature', 'monster', 'fantasy', 'rpg', 'cloud', 'server', 'network', 'data',
  'image', 'photo', 'illustration', 'scene', 'workflow', 'computer',
  'dark', 'desk', 'old', 'modern'
]);

const SUBJECT_ALIAS_OVERRIDES = {
  deployment: ['deploy', 'automation', 'infrastructure', 'server', 'cloud'],
  github: ['code', 'software', 'repository', 'programming'],
  subnet: ['network', 'topology', 'router', 'routing', 'ethernet', 'lan'],
  observability: ['monitoring', 'metrics', 'logs', 'alerts', 'telemetry'],
  cloudwatch: ['monitoring', 'metrics', 'logs', 'alerts', 'cloud'],
  resilience: ['reliability', 'recovery', 'incident', 'outage', 'failure', 'monitoring'],
  reliability: ['resilience', 'recovery', 'incident', 'outage', 'failure', 'monitoring'],
  doom: ['shareware', 'floppy', 'disk', 'dos'],
  shareware: ['floppy', 'disk', 'dos']
};

const TOPIC_AVOID = {
  kubernetes: ['train', 'railway', 'railroad', 'locomotive', 'mongolia', 'proxy', 'scraping'],
  k3s: ['train', 'railway', 'railroad', 'locomotive', 'mongolia', 'proxy', 'scraping'],
  proxmox: ['train', 'railway', 'railroad', 'locomotive', 'mongolia', 'proxy', 'scraping'],
  docker: ['ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight'],
  compose: ['ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight'],
  devops: ['soldier', 'army', 'military', 'weapon', 'war', 'patrol', 'afghanistan'],
  gitops: ['soldier', 'army', 'military', 'weapon', 'war', 'patrol', 'afghanistan'],
  rss: ['ebook', 'e-book', 'kobo', 'tablet', 'reading', 'novel'],
  freshrss: ['ebook', 'e-book', 'kobo', 'tablet', 'reading', 'novel'],
  logging: ['wood', 'timber', 'firewood', 'forest', 'tree', 'lumber', 'space', 'spacex', 'rocket', 'nasa', 'cape canaveral'],
  logger: ['wood', 'timber', 'firewood', 'forest', 'tree', 'lumber'],
  observability: ['wood', 'timber', 'firewood', 'forest', 'tree', 'lumber'],
  cloudwatch: ['wood', 'timber', 'firewood', 'forest', 'tree', 'lumber'],
  regression: ['school', 'pupil', 'student', 'teaching', 'education', 'exam', 'classroom'],
  testing: ['school', 'pupil', 'student', 'teaching', 'education', 'exam', 'classroom'],
  doom: ['truck', 'pickup', 'vehicle', 'car', 'chevrolet'],
  shareware: ['truck', 'pickup', 'vehicle', 'car', 'chevrolet']
};

const VISUAL_INTENTS = [
  {
    key: 'doom-shareware-history',
    priority: 35,
    pixabayImageType: 'all',
    markers: ['doom', 'shareware', 'commander keen', 'wolfenstein'],
    query: 'doom retro pc gaming shareware floppy disk 1990s',
    queryVariants: [
      'doom game 1993 pc',
      'retro pc shareware floppy disk',
      '1990s pc gaming floppy disk shareware'
    ],
    queryLimit: 6,
    positive: ['doom', 'shareware', 'floppy', 'disk', '1990s', 'retro', 'pc', 'gaming', 'computer', 'dos'],
    minMatches: 2,
    requiredGroups: [
      ['doom', 'shareware', 'floppy', 'disk', '1990s', 'retro']
    ],
    avoid: ['modern console', 'controller', 'rgb', 'laptop', 'office', 'smartphone', 'esports']
  },
  {
    key: 'pacman-arcade',
    priority: 30,
    pixabayImageType: 'all',
    markers: ['pac-man', 'pacman', 'puck man', 'puck-man', 'paku paku', 'パクパク'],
    query: 'pacman maze arcade yellow character ghost chase retro',
    positive: ['pacman', 'maze', 'arcade', 'yellow', 'ghost', 'chase', 'retro', 'game', 'gaming', 'pixel', 'dots'],
    minMatches: 2,
    requiredGroups: [
      ['maze', 'arcade', 'pacman']
    ],
    avoid: ['computer', 'keyboard', 'monitor', 'space invaders', 'atari', 'sega', 'console', 'controller', 'hardware', 'laptop', 'terminal', 'screenshot', 'office', 'desk']
  },
  {
    key: 'pokemon-oop-domain-model',
    priority: 35,
    pixabayImageType: 'all',
    markers: ['pokémon', 'pokemon', 'pikachu', 'oop', 'domain-modeling', 'domain modeling'],
    query: 'pokemon game handheld battle',
    queryVariants: [
      'pokemon pikachu game',
      'pokemon pokeball game',
      'pokemon handheld game',
      'pokemon gameboy cartridge',
      'pokemon battle game'
    ],
    queryLimit: 6,
    positive: [
      'pokemon', 'pokémon', 'pikachu', 'pokeball',
      'game', 'gaming', 'handheld', 'console', 'cartridge',
      'battle', 'rpg', 'creature', 'monster'
    ],
    minMatches: 2,
    requiredGroups: [
      ['pokemon', 'pokémon', 'pikachu', 'pokeball']
    ],
    avoid: [
      'mario', 'super mario', 'marios', 'zelda', 'link', 'sonic', 'kirby',
      'minecraft', 'fortnite', 'cassette', 'tape', 'recorder', 'music', 'album',
      'office', 'laptop', 'keyboard', 'terminal', 'screenshot'
    ]
  },
  {
    key: 'writing-proofreading',
    markers: ['legasthenie', 'rechtschreib', 'cspell', 'languagetool', 'proofread', 'spelling', 'grammar'],
    query: 'writing proofreading text document keyboard spelling grammar',
    queryVariants: [
      'proofreading correction paper spelling grammar',
      'editing manuscript text correction document'
    ],
    positive: ['writing', 'text', 'document', 'keyboard', 'spelling', 'grammar', 'proofreading', 'editing', 'words', 'typewriter', 'correction', 'correcting'],
    minMatches: 2,
    requiredGroups: [
      ['writing', 'text', 'document', 'spelling', 'grammar', 'proofreading', 'editing', 'words', 'typewriter']
    ],
    avoid: ['secretary', 'office', 'telephone', 'call', 'sales', 'robot', 'robotics', 'factory', 'business', 'analytics', 'big data', 'cyber', 'security']
  },
  {
    key: 'rss-reader',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['freshrss', 'miniflux', 'rss', 'feed'],
    query: 'rss feed reader dashboard aggregator browser subscription',
    queryVariants: [
      'news feed dashboard browser articles subscriptions',
      'feed reader interface subscriptions articles'
    ],
    positive: ['rss', 'feed', 'reader', 'dashboard', 'aggregator', 'browser', 'subscription', 'syndication', 'articles'],
    minMatches: 2,
    requiredGroups: [
      ['rss', 'feed', 'reader', 'aggregator', 'syndication']
    ],
    avoid: ['speed', 'speedometer', 'download', 'upload', 'mbps', 'broadband', 'performance', 'icon', 'logo', 'symbol', 'button', 'isolated', 'journalist', 'press', 'photographer', 'reporter', 'newspaper', 'television', 'book', 'books', 'bookstore', 'library', 'novel', 'novels', 'ebook', 'e-book', 'kobo', 'tablet', 'reading', 'server', 'rack', 'datacenter', 'storage', 'hard drive', 'disk', 'database']
  },
  {
    key: 'dependency-updates',
    pixabayCategory: 'computer',
    markers: ['dependabot', 'dependency', 'dependencies', 'supply-chain', 'supply chain'],
    query: 'software dependency package update code github vulnerability',
    positive: ['dependency', 'dependencies', 'package', 'update', 'software', 'code', 'github', 'vulnerability'],
    avoid: ['safe', 'vault', 'lock', 'padlock', 'key', 'insurance']
  },
  {
    key: 'systemd-service',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['systemd', 'journalctl'],
    query: 'linux server administration monitoring service logs daemon',
    queryVariants: [
      'linux service monitoring daemon process administration',
      'server service logs monitoring process linux'
    ],
    positive: ['linux', 'server', 'service', 'logs', 'administration', 'monitoring', 'daemon', 'process'],
    minMatches: 2,
    requiredGroups: [
      ['service', 'logs', 'monitoring', 'daemon', 'process']
    ],
    avoid: ['screenshot', 'window', 'cmd', 'console', 'terminal', 'prompt', 'scroll', 'minimize', 'smartphone', 'photography', 'binary', 'globe', 'game', 'gaming', 'playstation', 'controller', 'xbox', 'sony', 'train', 'subway', 'station', 'airport', 'vehicle', 'transport', 'ambulance', 'html', 'css', 'website', 'web design', 'office', 'workspace', 'desktop', 'sorting', 'classification', 'report', 'database', 'decision']
  },
  {
    key: 'docker-compose',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['docker compose', 'docker', 'compose'],
    query: 'devops deployment orchestration services architecture workflow',
    positive: ['deployment', 'devops', 'orchestration', 'services', 'architecture', 'workflow', 'configuration', 'automation'],
    requiredGroups: [
      ['deployment', 'devops', 'orchestration', 'services', 'architecture', 'workflow', 'configuration', 'automation']
    ],
    avoid: ['screen', 'screenshot', 'terminal', 'wallpaper', 'container', 'box', 'jar', 'can', 'vessel', 'urn', 'storage', 'ship', 'cargo', 'port', 'harbour', 'harbor', 'shipping', 'freight']
  },
  {
    key: 'semantic-search',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['semantic-search', 'semantic search', 'kernel grep', 'embeddings', 'duckdb'],
    query: 'search data code analytics magnifying glass',
    positive: ['search', 'data', 'code', 'magnifying', 'analytics', 'embedding'],
    minMatches: 2,
    avoid: ['robot', 'human', 'person', 'google', 'smartphone', 'mobile phone', 'telephone', 'container', 'box', 'jar', 'cyber', 'security', 'hacker']
  },
  {
    key: 'vpc-networking',
    pixabayCategory: 'computer',
    markers: ['vpc', 'subnet', 'route-table', 'route table', 'nat-gateway', 'internet-gateway'],
    query: 'computer network topology router routing subnet infrastructure',
    positive: ['topology', 'router', 'routing', 'subnet', 'infrastructure', 'ethernet'],
    minMatches: 2,
    requiredGroups: [
      ['topology', 'router', 'routing', 'subnet', 'ethernet', 'network']
    ],
    avoid: ['social media', 'icons', 'online', 'smartphone', 'database', 'storage', 'rack', 'datacenter']
  },
  {
    key: 'chaos-monkey',
    priority: 20,
    pixabayCategory: 'animals',
    pixabayImageType: 'all',
    markers: ['chaos monkey'],
    query: 'monkey ape primate chimpanzee macaque',
    positive: ['monkey', 'ape', 'primate', 'chimpanzee', 'macaque', 'baboon'],
    requiredGroups: [
      ['monkey', 'ape', 'primate', 'chimpanzee', 'macaque', 'baboon']
    ],
    avoid: ['error', 'cross', 'warning', 'sign', 'icon', 'symbol', 'button', 'interface', 'gui']
  },
  {
    key: 'chaos-engineering',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['chaos-engineering', 'chaos engineering', 'blast radius', 'steady state', 'resilience'],
    query: 'server monitoring outage incident failure resilience reliability',
    queryVariants: [
      'server outage monitoring incident recovery infrastructure',
      'infrastructure failure recovery monitoring reliability',
      'resilience reliability server monitoring incident'
    ],
    positive: ['server', 'monitoring', 'outage', 'infrastructure', 'reliability', 'incident', 'failure', 'resilience', 'observability', 'recovery'],
    minMatches: 2,
    requiredGroups: [
      ['monitoring', 'outage', 'incident', 'failure', 'reliability', 'resilience', 'observability']
    ],
    avoid: ['error', 'cross', 'warning', 'sign', 'icon', 'symbol', 'button', 'touch', 'finger', 'school', 'university', 'exam', 'examination', 'chemistry', 'chemical', 'laboratory', 'medical', 'business', 'management', 'sales', 'marketing']
  },
  {
    key: 'regression-testing',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['regressionstest', 'regression test', 'regression'],
    query: 'software testing quality assurance bug code',
    queryVariants: [
      'software test automation bug quality assurance',
      'continuous integration automated testing code bug'
    ],
    positive: ['testing', 'test', 'quality', 'assurance', 'bug', 'software', 'code', 'automation', 'continuous integration'],
    minMatches: 2,
    requiredGroups: [
      ['testing', 'test', 'quality', 'assurance', 'bug']
    ],
    avoid: ['business', 'meeting', 'office', 'school', 'pupil', 'student', 'teaching', 'education', 'exam', 'classroom', 'electrical', 'vehicle', 'automotive', 'mechanical', 'manufacturing']
  },
  {
    key: 'logging-observability',
    pixabayCategory: 'computer',
    pixabayImageType: 'all',
    markers: ['logger.info', 'logging', 'logger', 'observability'],
    query: 'server logs monitoring metrics observability cloudwatch alerts',
    queryVariants: [
      'application logs monitoring metrics alerts server',
      'observability telemetry metrics logs monitoring'
    ],
    positive: ['server', 'logs', 'logging', 'monitoring', 'metrics', 'observability', 'cloudwatch', 'alerts', 'telemetry'],
    minMatches: 2,
    requiredGroups: [
      ['logs', 'logging', 'monitoring', 'metrics', 'observability', 'cloudwatch', 'alerts']
    ],
    avoid: ['dashboard', 'car', 'speedometer', 'vehicle', 'automobile', 'steering', 'smartphone', 'photography', 'binary', 'game', 'gaming', 'business', 'meeting', 'office', 'wood', 'timber', 'firewood', 'forest', 'tree', 'lumber', 'space', 'spacex', 'rocket', 'nasa', 'cape canaveral']
  },
  {
    key: 'photo-storage-sync',
    pixabayCategory: 'computer',
    markers: ['immich', 'nextcloud', 'webdav', 'rclone'],
    query: 'cloud photo backup files gallery sync',
    queryVariants: [
      'photo library cloud backup gallery sync',
      'image gallery files cloud synchronization backup',
      'photo management cloud storage gallery files'
    ],
    positive: ['photo', 'gallery', 'files', 'sync', 'cloud', 'image', 'backup', 'library', 'storage'],
    minMatches: 2,
    requiredGroups: [
      ['photo', 'gallery', 'image'],
      ['files', 'sync', 'cloud', 'backup']
    ],
    avoid: ['airplane', 'jet', 'fighter', 'aircraft', 'military', 'war', 'aviation', 'pilot', 'owl', 'photographer', 'tourist', 'warehouse', 'mini storage', 'self storage', 'music', 'business', 'meeting', 'office']
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
  const options = { target: '', query: '', select: 0, selectId: '', scoreOverride: null, preview: false, report: '' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (!arg.startsWith('--') && !options.target) options.target = arg;
    else if (arg === '--query' && next) { options.query = next.trim(); i += 1; }
    else if (arg === '--select' && next) { options.select = Number.parseInt(next, 10); i += 1; }
    else if (arg === '--select-id' && next) { options.selectId = String(next).trim(); i += 1; }
    else if (arg === '--score' && next) {
      const score = Number(next);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('--score must be between 0 and 100');
      options.scoreOverride = Math.round(score);
      i += 1;
    }
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

function canonicalSubjectToken(value) {
  return normalizeText(value).replace(/[^a-z0-9+#]+/g, '');
}

function subjectAnchors(data = {}, query = '') {
  const queryTokens = tokensFrom(query || data.cover_query);
  if (!queryTokens.length) return [];

  const candidatesFor = (identityTokens) => {
    const canonicalQuery = new Set(queryTokens.map(canonicalSubjectToken).filter(Boolean));
    const anchors = [];

    for (const rawToken of identityTokens) {
      const token = canonicalSubjectToken(rawToken);
      if (!token || token.length < 3 || GENERIC_SUBJECT_CONTEXT_TERMS.has(token)) continue;

      if (canonicalQuery.has(token)) {
        anchors.push(token);
        continue;
      }

      const visualAliases = [
        ...(TOPIC_EXPANSIONS[token] || []),
        ...(SUBJECT_ALIAS_OVERRIDES[token] || [])
      ]
        .flatMap((value) => tokensFrom(value))
        .map(canonicalSubjectToken)
        .filter(Boolean);

      if (visualAliases.some((alias) => canonicalQuery.has(alias))) {
        anchors.push(token);
      }
    }

    return [...new Set(anchors)].slice(0, 8);
  };

  // The article's own identity is stronger than the visual brief. A word that
  // only appears in cover_subject (for example "smartphone" in an NFC scene)
  // is context, not automatically the subject of the article.
  const articleIdentity = candidatesFor([
    ...tokensFrom(data.title),
    ...normalizedTags(data).flatMap(tokensFrom)
  ]);
  if (articleIdentity.length) return articleIdentity;

  return candidatesFor(tokensFrom(data.cover_subject));
}

function subjectAliasTokens(anchor, intent = null) {
  const aliases = new Set([anchor]);

  for (const related of TOPIC_EXPANSIONS[anchor] || []) {
    for (const token of tokensFrom(related)) aliases.add(canonicalSubjectToken(token));
  }
  for (const related of SUBJECT_ALIAS_OVERRIDES[anchor] || []) {
    for (const token of tokensFrom(related)) aliases.add(canonicalSubjectToken(token));
  }

  // Intent groups validate the scene separately. Subject aliases stay
  // intentionally narrower, otherwise era/style words such as "retro" or
  // "1990s" could impersonate a concrete subject such as DOOM.
  void intent;

  return [...aliases].filter(Boolean);
}

function subjectAnchorEvidence(hitTokens, anchors, intent = null) {
  const canonicalHits = new Set([...hitTokens].map(canonicalSubjectToken));
  const matches = [];
  const evidence = {};

  for (const anchor of anchors) {
    const aliases = subjectAliasTokens(anchor, intent);
    const hit = aliases.find((token) => canonicalHits.has(token));
    if (!hit) continue;
    matches.push(anchor);
    evidence[anchor] = hit;
  }

  return { matches, evidence };
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
  const explicitKey = String(data.cover_intent || '').trim().toLowerCase();
  if (explicitKey) {
    const explicit = VISUAL_INTENTS.find((intent) => intent.key === explicitKey);
    if (!explicit) {
      const supported = VISUAL_INTENTS.map((intent) => intent.key).sort().join(', ');
      throw new Error(`Unknown cover_intent "${explicitKey}". Supported intents: ${supported}`);
    }
    return {
      ...explicit,
      ...visualIntentEvidence(data, explicit),
      explicit: true
    };
  }

  const matches = VISUAL_INTENTS
    .map((intent) => ({
      ...intent,
      ...visualIntentEvidence(data, intent)
    }))
    .filter((intent) => intent.evidenceScore >= Number(intent.minEvidence || 6))
    .sort((left, right) => {
      if (Number(right.priority || 0) !== Number(left.priority || 0)) {
        return Number(right.priority || 0) - Number(left.priority || 0);
      }
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

function intentSearchVariants(data = {}, intent = null) {
  if (!intent) return [];

  const anchors = subjectAnchors(data, intent.query || data.cover_query || '');
  const requiredTerms = [...new Set(
    (intent.requiredGroups || [])
      .flatMap((group) => group)
      .flatMap((value) => tokensFrom(value))
  )];
  const positiveTerms = [...new Set(
    (intent.positive || []).flatMap((value) => tokensFrom(value))
  )];

  const variants = [];
  if (anchors.length && requiredTerms.length) {
    variants.push([anchors[0], ...requiredTerms.slice(0, 6)].join(' '));
  }
  if (requiredTerms.length) {
    variants.push(requiredTerms.slice(0, 8).join(' '));
  } else if (positiveTerms.length) {
    variants.push(positiveTerms.slice(0, 8).join(' '));
  }

  return [...new Set(
    variants
      .map((value) => String(value || '').trim().slice(0, 100))
      .filter(Boolean)
  )];
}

function articleVisualBrief(data = {}) {
  const tags = normalizedTags(data).slice(0, 6);
  const searchQueries = Array.isArray(data.search_queries)
    ? data.search_queries
      .map((entry) => typeof entry === 'string' ? entry : entry?.query)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, 2)
    : [];

  const title = String(data.title || '').trim();
  const subject = String(data.cover_subject || '').trim();
  const category = String(data.category || '').trim();
  const excerpt = String(data.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 420);

  const positive = [
    'Editorial hero cover for a technical blog article.',
    title ? `Main article: ${title}` : '',
    subject ? `Primary subject: ${subject}` : '',
    tags.length ? `Topics: ${tags.join(', ')}` : '',
    category ? `Category: ${category}` : '',
    excerpt ? `Summary: ${excerpt}` : '',
    searchQueries.length ? `Reader intent: ${searchQueries.join('; ')}` : '',
    'Prefer a concrete contextual scene, useful visual metaphor, architecture, workflow, object or environment that communicates the main subject.'
  ].filter(Boolean).join(' ');

  const negative = [
    'Unrelated generic stock photography.',
    'Generic office meeting or smiling portrait.',
    'Standalone logo, icon, symbol or button.',
    'Generic error cross or warning sign.',
    'Empty terminal window, raw code screenshot or generic programmer-at-laptop image unless the article is specifically about that interface.',
    'Generic server rack or datacenter unless infrastructure itself is the main subject.'
  ].join(' ');

  return {
    positive: positive.slice(0, 1600),
    negative: negative.slice(0, 1200)
  };
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

  const intentQueries = intent
    ? [
        intent.query,
        ...(Array.isArray(intent.queryVariants) ? intent.queryVariants : []),
        ...intentSearchVariants(data, intent)
      ]
    : [];
  const candidates = explicitQuery
    ? (intent
      ? [primary, ...intentQueries, visual || fallback]
      : [primary, visual, fallback])
    : (intent
      ? [...intentQueries, primary, visual || fallback]
      : [primary, title, visual || fallback]);

  const queryLimit = Math.max(1, Number(intent?.queryLimit || (intent ? 5 : 3)));
  return [...new Set(candidates.filter(Boolean).map((value) => String(value).slice(0, 100)))].slice(0, queryLimit);
}

function articleProfile(data, query = '') {
  const intent = visualIntent(data);
  const subject = subjectAnchors(data, query);
  const subjectSet = new Set(subject);
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

  const explicitAvoid = [
    ...(intent?.avoid || []),
    ...listFrom(data.cover_avoid)
  ];
  const explicitAvoidTokens = explicitAvoid
    .flatMap((value) => tokensFrom(value))
    .filter((token) => !subjectSet.has(canonicalSubjectToken(token)));
  const contextualAvoidTokens = contextualAvoid
    .flatMap((value) => tokensFrom(value))
    .filter((token) => !subjectSet.has(canonicalSubjectToken(token)));
  const avoid = new Set([
    ...DEFAULT_AVOID_TERMS,
    ...contextualAvoidTokens,
    ...explicitAvoidTokens
  ]);
  const hardAvoid = new Set([
    ...contextualAvoidTokens,
    ...explicitAvoidTokens
  ]);

  const intentPositive = new Set((intent?.positive || []).flatMap((value) => tokensFrom(value)));
  const intentAvoid = new Set((intent?.avoid || []).flatMap((value) => tokensFrom(value)));
  const intentRequiredGroups = (intent?.requiredGroups || []).map(
    (group) => new Set(group.flatMap((value) => tokensFrom(value)))
  );

  return {
    primary,
    expanded,
    subjectAnchors: subject,
    avoid,
    hardAvoid,
    intent,
    intentPositive,
    intentAvoid,
    intentRequiredGroups
  };
}

function exactTagTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function heroHardGate(hit = {}) {
  const width = Number(hit.imageWidth || hit.webformatWidth || 0);
  const height = Number(hit.imageHeight || hit.webformatHeight || 0);
  const ratio = width > 0 && height > 0 ? width / height : 0;
  const tags = exactTagTokens(hit.tags);
  const uniqueTags = [...new Set(tags)];
  const imageType = String(hit.type || '').toLowerCase();

  const hardLogoTerms = uniqueTags.filter((tag) => HARD_LOGO_TERMS.has(tag));
  const symbolTerms = uniqueTags.filter((tag) => SYMBOL_LIKE_TERMS.has(tag));
  const repeatedTagCount = tags.length - uniqueTags.length;
  const lowInformationVector = imageType === 'vector'
    && uniqueTags.length <= 5
    && (symbolTerms.length > 0 || repeatedTagCount >= 2);
  const logoLike = hardLogoTerms.length > 0 || symbolTerms.length >= 2 || lowInformationVector;

  const reasons = [];
  if (width < HERO_MIN_WIDTH || height < HERO_MIN_HEIGHT) {
    reasons.push(`hero size ${width}x${height} below ${HERO_MIN_WIDTH}x${HERO_MIN_HEIGHT}`);
  }
  if (ratio > 0 && (ratio < HERO_MIN_ASPECT || ratio > HERO_MAX_ASPECT)) {
    reasons.push(`hero aspect ${ratio.toFixed(2)} outside ${HERO_MIN_ASPECT}-${HERO_MAX_ASPECT}`);
  }
  if (logoLike) {
    reasons.push(
      lowInformationVector
        ? 'low-information vector/icon artwork'
        : `logo/icon artwork: ${[...hardLogoTerms, ...symbolTerms].slice(0, 4).join(', ')}`
    );
  }

  return {
    rejected: reasons.length > 0,
    reasons,
    width,
    height,
    ratio,
    imageType,
    uniqueTagCount: uniqueTags.length,
    logoLike
  };
}

function scoreHit(hit, data = {}, query = '') {
  const profile = articleProfile(data, query);
  const gate = heroHardGate(hit);
  const hitTokens = new Set(tokensFrom(hit.tags));
  let score = 28;
  const reasons = gate.reasons.map((reason) => `HARD REJECT: ${reason}`);

  const directMatches = [...hitTokens].filter(
    (token) => profile.primary.has(token) && !WEAK_DIRECT_TERMS.has(token)
  );
  const expandedMatches = [...hitTokens].filter((token) => !profile.primary.has(token) && profile.expanded.has(token));
  const avoidMatches = [...hitTokens].filter((token) => profile.avoid.has(token));
  const hardAvoidMatches = [...hitTokens].filter((token) => profile.hardAvoid.has(token));
  const subjectEvidence = subjectAnchorEvidence(hitTokens, profile.subjectAnchors, profile.intent);
  const subjectAnchorMatches = subjectEvidence.matches;
  const subjectAnchorEvidenceMap = subjectEvidence.evidence;
  const subjectAnchorRequired = profile.subjectAnchors.length > 0;
  const intentMatches = [...hitTokens].filter((token) => profile.intentPositive.has(token));
  const intentAvoidMatches = [...hitTokens].filter((token) => profile.intentAvoid.has(token));
  const requiredGroupMatches = profile.intentRequiredGroups.map(
    (group) => [...hitTokens].filter((token) => group.has(token))
  );
  const requiredGroupsMet = requiredGroupMatches.every((matches) => matches.length > 0);

  if (subjectAnchorRequired) {
    if (subjectAnchorMatches.length) {
      score += 24;
      const evidence = subjectAnchorMatches
        .slice(0, 3)
        .map((anchor) => subjectAnchorEvidenceMap[anchor] && subjectAnchorEvidenceMap[anchor] !== anchor
          ? `${anchor}→${subjectAnchorEvidenceMap[anchor]}`
          : anchor);
      reasons.push(`+24 subject anchor: ${evidence.join(', ')}`);
    } else {
      score -= 45;
      reasons.push(`-45 missing subject anchor: ${profile.subjectAnchors.slice(0, 4).join(', ')}`);
    }
  }

  if (profile.intent) {
    const minIntentMatches = Math.max(1, Number(profile.intent.minMatches || 1));
    const intentRequirementMet = intentMatches.length >= minIntentMatches && requiredGroupsMet;
    if (intentRequirementMet) {
      const points = Math.min(42, intentMatches.length * 14);
      score += points;
      reasons.push(`+${points} visual intent (${profile.intent.key}): ${intentMatches.slice(0, 4).join(', ')}`);
    } else {
      score -= 35;
      const groupStatus = profile.intentRequiredGroups.length
        ? `, groups ${requiredGroupMatches.filter((matches) => matches.length > 0).length}/${profile.intentRequiredGroups.length}`
        : '';
      reasons.push(
        `-35 visual intent mismatch: ${profile.intent.key} (${intentMatches.length}/${minIntentMatches}${groupStatus})`
      );
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
    hardAvoidMatches,
    subjectAnchors: profile.subjectAnchors,
    subjectAnchorMatches,
    subjectAnchorEvidence: subjectAnchorEvidenceMap,
    subjectAnchorRequired,
    intentKey: profile.intent?.key || '',
    intentMatches,
    intentAvoidMatches,
    requiredGroupMatches,
    heroRejected: gate.rejected,
    heroRejectReasons: gate.reasons,
    heroWidth: gate.width,
    heroHeight: gate.height,
    heroAspect: gate.ratio,
    heroLogoLike: gate.logoLike,
    semanticMismatch: Boolean(
      gate.rejected
      || (subjectAnchorRequired && subjectAnchorMatches.length === 0)
      || hardAvoidMatches.length > 0
      || intentAvoidMatches.length > 0
      || (
        profile.intent && (
          intentMatches.length < Math.max(1, Number(profile.intent.minMatches || 1))
          || !requiredGroupsMet
        )
      )
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

async function searchPixabay(query, apiKey, fetchImpl = globalThis.fetch, options = {}) {
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);

  const requestedImageType = String(options.imageType || 'photo').trim().toLowerCase();
  const imageType = ['all', 'photo', 'illustration', 'vector'].includes(requestedImageType)
    ? requestedImageType
    : 'photo';
  url.searchParams.set('image_type', imageType);
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');
  url.searchParams.set('per_page', '30');
  url.searchParams.set('min_width', String(HERO_MIN_WIDTH));
  url.searchParams.set('min_height', String(HERO_MIN_HEIGHT));

  const category = String(options.category || '').trim().toLowerCase();
  if (category) url.searchParams.set('category', category);

  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Pixabay search failed with HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.hits) ? payload.hits : [];
}

function cacheFileForQuery(
  query,
  cacheDir = path.join(root, '.cache', 'pixabay'),
  category = '',
  imageType = 'photo'
) {
  const digest = crypto.createHash('sha256')
    .update(`v4:${String(category)}:${String(imageType)}:${String(query)}`)
    .digest('hex')
    .slice(0, 24);
  return path.join(cacheDir, `${digest}.json`);
}

async function searchPixabayCached(query, apiKey, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cacheDir = options.cacheDir || path.join(root, '.cache', 'pixabay');
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const category = String(options.category || '').trim().toLowerCase();
  const imageType = String(options.imageType || 'photo').trim().toLowerCase();
  const cacheFile = cacheFileForQuery(query, cacheDir, category, imageType);

  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    const age = now - Number(cached.cachedAt || 0);
    if (age >= 0 && age < PIXABAY_CACHE_TTL_MS && Array.isArray(cached.hits)) {
      return cached.hits;
    }
  } catch (error) {
    if (!error || (error.code !== 'ENOENT' && error.name !== 'SyntaxError')) throw error;
  }

  const hits = await searchPixabay(query, apiKey, fetchImpl, { category, imageType });
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    cacheFile,
    JSON.stringify({ cachedAt: now, query, category, imageType, hits }, null, 2),
    'utf8'
  );
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

async function downloadPhoto(hit, fetchImpl = globalThis.fetch, options = {}) {
  const sourceUrl = hit.largeImageURL || hit.webformatURL;
  if (!sourceUrl) throw new Error('Pixabay result has no downloadable image URL');

  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== 'https:') throw new Error('Pixabay image URL must use HTTPS');

  const maxAttempts = Math.max(1, Number(options.maxAttempts || 4));
  const sleep = options.sleep || delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(sourceUrl);

    if (response.ok) {
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

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Pixabay image download failed with HTTP ${response.status}`);
    }

    const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '');
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(5000, Math.round(retryAfter * 1000))
      : Math.min(4000, 500 * (2 ** (attempt - 1)));

    console.warn(
      `Pixabay image download returned HTTP ${response.status}; retrying in ${backoffMs} ms (attempt ${attempt + 1}/${maxAttempts})`
    );
    await sleep(backoffMs);
  }

  throw new Error('Pixabay image download failed after retries');
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
    imageType: hit.type || '',
    imageWidth: Number(hit.imageWidth || hit.webformatWidth || 0),
    imageHeight: Number(hit.imageHeight || hit.webformatHeight || 0),
    heroRejected: Boolean(entry.heroRejected),
    heroRejectReasons: entry.heroRejectReasons || [],
    heroLogoLike: Boolean(entry.heroLogoLike),
    searchQuery: hit.__coverQuery || '',
    searchQueries: hit.__coverQueries || (hit.__coverQuery ? [hit.__coverQuery] : []),
    intentKey: entry.intentKey || '',
    intentMatches: entry.intentMatches || [],
    subjectAnchors: entry.subjectAnchors || [],
    subjectAnchorMatches: entry.subjectAnchorMatches || [],
    subjectAnchorEvidence: entry.subjectAnchorEvidence || {},
    subjectAnchorRequired: Boolean(entry.subjectAnchorRequired),
    hardAvoidMatches: entry.hardAvoidMatches || [],
    requiredGroupMatches: entry.requiredGroupMatches || [],
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
  if (!options.target) throw new Error('Usage: npm run covers:resolve -- posts/<post>.md [--query "..."] [--select 1 | --select-id 123] [--score 88] [--report /tmp/report.json]');

  const apiKey = String(process.env.PIXABAY_API_KEY || '').trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY is required');

  const postsRoot = path.resolve(root, 'posts');
  const target = path.resolve(root, options.target);
  if (!target.startsWith(`${postsRoot}${path.sep}`)) throw new Error('Target must be inside posts/');

  const raw = await fs.readFile(target, 'utf8');
  const parsed = matter(raw);
  const queries = queryCandidates(parsed.data, options.query);
  if (!queries.length) throw new Error('Could not derive a Pixabay cover query');

  const intent = visualIntent(parsed.data);
  const pixabayCategory = String(intent?.pixabayCategory || '').trim();
  const pixabayImageType = String(intent?.pixabayImageType || 'all').trim();
  const hits = await collectCandidates(queries, apiKey, {
    searchOptions: {
      category: pixabayCategory,
      imageType: pixabayImageType
    }
  });
  if (!hits.length) throw new Error(`No Pixabay images matched: ${queries.join(' | ')}`);

  const rankingQuery = String(options.query || queries[0] || '').trim();
  const ranked = rankCandidates(hits, parsed.data, rankingQuery);
  const visualBrief = articleVisualBrief(parsed.data);
  const reportBase = {
    postPath: options.target,
    title: parsed.data.title || path.basename(target, '.md'),
    series: detectSeries(parsed.data),
    visualIntent: intent?.key || '',
    visualIntentEvidence: intent?.evidenceScore || 0,
    subjectAnchors: subjectAnchors(parsed.data, rankingQuery),
    visualBriefPositive: visualBrief.positive,
    visualBriefNegative: visualBrief.negative,
    pixabayCategory,
    pixabayImageType,
    query: rankingQuery,
    queries,
    candidates: ranked.slice(0, 30).map(reportCandidate)
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
    cover_score: options.scoreOverride ?? selectedEntry.score,
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
  HERO_MAX_ASPECT,
  HERO_MIN_ASPECT,
  HERO_MIN_HEIGHT,
  HERO_MIN_WIDTH,
  articleProfile,
  articleVisualBrief,
  cacheFileForQuery,
  choosePhoto,
  collectCandidates,
  defaultQuery,
  detectSeries,
  downloadPhoto,
  fileExtension,
  findPhotoById,
  heroHardGate,
  intentSearchVariants,
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
  subjectAnchors,
  subjectAliasTokens,
  subjectAnchorEvidence,
  updateCoverStylesheet
};
