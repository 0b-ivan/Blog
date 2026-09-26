const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const {
  PIXABAY_CACHE_TTL_MS,
  VISUAL_INTENTS,
  HERO_MIN_HEIGHT,
  HERO_MIN_WIDTH,
  articleVisualBrief,
  choosePhoto,
  collectCandidates,
  defaultQuery,
  detectSeries,
  downloadPhoto,
  fileExtension,
  findPhotoById,
  heroHardGate,
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
  intentSearchVariants,
  subjectSearchVariants
} = require('../scripts/resolve-pixabay-cover');

describe('Pixabay cover resolver', () => {
  it('derives a compact search query from article metadata', () => {
    expect(defaultQuery({
      title: 'Chaos Monkey gegen meinen Blog',
      category: 'DevOps',
      tags: ['Kubernetes', 'Chaos Engineering', 'K3s', 'Cloudflare']
    })).toBe('Kubernetes Chaos Engineering K3s DevOps');
    expect(defaultQuery({ title: 'Test', tags: [] }).length).toBeLessThanOrEqual(100);
  });

  it('detects article series explicitly or from Teil/Part titles', () => {
    expect(detectSeries({
      series: 'K3s auf Proxmox'
    })).toBe('k3s-auf-proxmox');

    expect(detectSeries({
      title: 'K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen Blog'
    })).toBe('k3s-auf-proxmox');

    expect(detectSeries({
      title: 'Docker vs. Docker Compose: Was ist der Unterschied?'
    })).toBe('');
  });

  it('parses resolver CLI arguments', () => {
    expect(parseArgs([
      'posts/test.md',
      '--query',
      'kubernetes datacenter',
      '--select',
      '2'
    ])).toEqual({
      target: 'posts/test.md',
      query: 'kubernetes datacenter',
      select: 2,
      selectId: '',
      scoreOverride: null,
      preview: false,
      report: ''
    });

    expect(parseArgs(['posts/test.md', '--preview', '--report', '/tmp/report.json'])).toMatchObject({
      target: 'posts/test.md',
      preview: true,
      report: '/tmp/report.json'
    });

    expect(parseArgs(['posts/test.md', '--select-id', '2402637'])).toMatchObject({
      target: 'posts/test.md',
      selectId: '2402637'
    });

    expect(parseArgs(['posts/test.md', '--select-id', '2402637', '--score', '91.4'])).toMatchObject({
      target: 'posts/test.md',
      selectId: '2402637',
      scoreOverride: 91
    });
  });

  it('selects the exact Pixabay image by stable provider id', () => {
    const hits = [
      { id: 10, tags: 'server' },
      { id: 20, tags: 'network' }
    ];

    expect(findPhotoById(hits, '20').id).toBe(20);
    expect(() => findPhotoById(hits, '99')).toThrow(
      'Selected Pixabay image id 99 is unavailable'
    );
  });

  it('calls Pixabay search with safe landscape filters', async () => {
    const fetchImpl = globalThis.vi.fn(async (url) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://pixabay.com');
      expect(parsed.searchParams.get('q')).toBe('kubernetes datacenter');
      expect(parsed.searchParams.get('image_type')).toBe('photo');
      expect(parsed.searchParams.get('orientation')).toBe('horizontal');
      expect(parsed.searchParams.get('safesearch')).toBe('true');
      expect(parsed.searchParams.get('per_page')).toBe('30');
      expect(parsed.searchParams.get('min_width')).toBe(String(HERO_MIN_WIDTH));
      expect(parsed.searchParams.get('min_height')).toBe(String(HERO_MIN_HEIGHT));
      expect(parsed.searchParams.get('key')).toBe('test-key');
      return {
        ok: true,
        json: async () => ({
          hits: [{ id: 42, pageURL: 'https://pixabay.com/photos/example-42/' }]
        })
      };
    });

    const hits = await searchPixabay('kubernetes datacenter', 'test-key', fetchImpl);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(42);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('retries transient Pixabay throttling with backoff', async () => {
    let attempt = 0;
    const sleep = globalThis.vi.fn(async () => {});
    const fetchImpl = globalThis.vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null }
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ hits: [{ id: 77, tags: 'rss, feed, reader' }] })
      };
    });

    const hits = await searchPixabay('rss feed reader', 'test-key', fetchImpl, {
      maxAttempts: 3,
      baseRetryMs: 500,
      sleep
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(77);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('hard-rejects undersized and logo-like hero candidates', () => {
    const small = heroHardGate({
      type: 'photo',
      tags: 'server, rack, datacenter',
      imageWidth: 1280,
      imageHeight: 720
    });
    expect(small.rejected).toBe(true);
    expect(small.reasons.join(' ')).toContain('below 1600x900');

    const logo = heroHardGate({
      type: 'vector',
      tags: 'feed, rss, website, internet, rss, rss',
      imageWidth: 1920,
      imageHeight: 1080
    });
    expect(logo.rejected).toBe(true);
    expect(logo.logoLike).toBe(true);

    const scene = heroHardGate({
      type: 'illustration',
      tags: 'rss, feed, reader, dashboard, browser, subscriptions, interface',
      imageWidth: 1920,
      imageHeight: 1080
    });
    expect(scene.rejected).toBe(false);
    expect(scene.logoLike).toBe(false);
  });

  it('marks hard-gated images as semantic mismatches before E5 reranking', () => {
    const article = {
      title: 'RSS ist nicht tot',
      tags: ['RSS', 'FreshRSS']
    };
    const result = scoreHit({
      type: 'vector',
      tags: 'feed, rss, website, internet, rss, rss',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(result.heroRejected).toBe(true);
    expect(result.semanticMismatch).toBe(true);
    expect(result.reasons.some((reason) => reason.startsWith('HARD REJECT:'))).toBe(true);
  });

  it('scopes technical visual intents to the Pixabay computer category', async () => {
    const systemdIntent = visualIntent({
      title: 'systemd Services sauber betreiben',
      tags: ['Linux', 'systemd', 'Operations']
    });
    expect(systemdIntent.pixabayCategory).toBe('computer');
    expect(systemdIntent.pixabayImageType).toBe('all');

    const fetchImpl = globalThis.vi.fn(async (url) => {
      const parsed = new URL(url);
      expect(parsed.searchParams.get('category')).toBe('computer');
      expect(parsed.searchParams.get('image_type')).toBe('all');
      return {
        ok: true,
        json: async () => ({ hits: [] })
      };
    });

    await searchPixabay('linux shell service logs', 'test-key', fetchImpl, {
      category: 'computer',
      imageType: 'all'
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('derives an article-specific visual brief even without a known intent', () => {
    const article = {
      title: 'NFC-Aufkleber: kleine Tags, große Automationen',
      category: 'Hardware',
      tags: ['NFC', 'Automation', 'Smart-Home'],
      excerpt: 'Wie passive NFC-Tags Daten speichern und Aktionen auf dem Smartphone auslösen.'
    };

    expect(visualIntent(article)).toBeNull();

    const brief = articleVisualBrief(article);
    expect(brief.positive).toContain('NFC-Aufkleber');
    expect(brief.positive).toContain('NFC, Automation, Smart-Home');
    expect(brief.negative).toContain('Standalone logo, icon, symbol or button');

    const queries = queryCandidates(article);
    expect(queries).toContain('NFC-Aufkleber: kleine Tags, große Automationen');
  });

  it('derives a visual intent before generic technical metadata', () => {
    const writing = {
      title: 'Fehlerarme Texte trotz Legasthenie: meine Rechtschreib-Pipeline',
      category: 'Automation',
      tags: ['GitHub-Actions', 'Automation', 'CSpell', 'LanguageTool'],
      excerpt: 'CSpell und LanguageTool prüfen meine Texte automatisch.'
    };

    expect(visualIntent(writing).key).toBe('writing-proofreading');
    expect(queryCandidates(writing)[0]).toBe(
      'writing proofreading text document keyboard spelling grammar'
    );

    const rssIntent = visualIntent({
      title: 'RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung',
      tags: ['RSS', 'FreshRSS', 'Miniflux']
    });
    expect(rssIntent.key).toBe('rss-reader');
    expect(rssIntent.pixabayCategory).toBe('computer');
    expect(rssIntent.pixabayImageType).toBe('all');
    expect(queryCandidates({
      title: 'RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung',
      tags: ['RSS', 'FreshRSS', 'Miniflux']
    })[0]).toBe('rss feed reader dashboard aggregator browser subscription');

    expect(visualIntent({
      title: 'Eine VPC ist keine schwarze Magie',
      tags: ['AWS', 'VPC', 'Networking', 'Subnet']
    }).key).toBe('vpc-networking');

    const chaosMonkeyIntent = visualIntent({
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience']
    });
    expect(chaosMonkeyIntent.key).toBe('chaos-monkey');
    expect(chaosMonkeyIntent.pixabayCategory).toBe('animals');
    expect(queryCandidates({
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience']
    })[0]).toBe('monkey ape primate chimpanzee macaque');
  });

  it('does not route every Docker article into the Docker Compose intent', () => {
    expect(visualIntent({
      title: 'Deployment mit Hetzner, Docker und Cloudflare Zero Trust',
      tags: ['Hetzner', 'Docker', 'Cloudflare', 'DevOps'],
      excerpt: 'Ein Deployment mit Containern und Cloudflare Zero Trust.'
    })?.key || '').not.toBe('docker-compose');

    expect(visualIntent({
      title: 'Docker vs. Docker Compose: Was ist der Unterschied?',
      tags: ['Docker', 'Compose', 'DevOps']
    }).key).toBe('docker-compose');
  });

  it('expands a strict intent into multiple focused search variants', () => {
    const article = {
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      category: 'Engineering',
      tags: ['Pokémon', 'Java', 'OOP', 'Domain-Modeling'],
      cover_intent: 'pokemon-oop-domain-model',
      cover_query: 'pokemon game handheld battle'
    };

    const queries = queryCandidates(article);
    expect(queries.length).toBeGreaterThan(3);
    expect(queries[0]).toBe('pokemon game handheld battle');
    expect(queries).toContain('pokemon pikachu game');
    expect(queries).toContain('pokemon gameboy cartridge');
  });

  it('derives subject anchors generically from the article identity and cover query', () => {
    expect(subjectAnchors({
      title: 'Wie funktionieren NFC-Aufkleber?',
      tags: ['NFC', 'Hardware', 'Automation'],
      cover_subject: 'NFC tag used with a smartphone',
      cover_query: 'nfc tag smartphone contactless'
    })).toContain('nfc');

    expect(subjectAnchors({
      title: 'Eine VPC ist keine schwarze Magie',
      tags: ['AWS', 'VPC', 'Networking'],
      cover_subject: 'cloud network topology',
      cover_query: 'computer network topology router subnet'
    })).not.toContain('network');
  });

  it('uses subject anchors as a generic hard gate outside Pokémon', () => {
    const article = {
      title: 'Wie funktionieren NFC-Aufkleber?',
      tags: ['NFC', 'Hardware', 'Automation'],
      cover_subject: 'NFC tag used with a smartphone',
      cover_query: 'nfc tag smartphone contactless'
    };

    const unrelatedSticker = scoreHit({
      type: 'photo',
      tags: 'sticker, barcode, smartphone, contactless, technology',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const nfcTag = scoreHit({
      type: 'photo',
      tags: 'nfc, tag, smartphone, contactless, technology',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(unrelatedSticker.subjectAnchors).toContain('nfc');
    expect(unrelatedSticker.subjectAnchorMatches).toHaveLength(0);
    expect(unrelatedSticker.semanticMismatch).toBe(true);
    expect(nfcTag.subjectAnchorMatches).toContain('nfc');
    expect(nfcTag.semanticMismatch).toBe(false);
  });

  it('does not let cover_avoid accidentally ban the article subject itself', () => {
    const result = scoreHit({
      type: 'photo',
      tags: 'nfc, tag, smartphone, contactless',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      title: 'Wie funktionieren NFC-Aufkleber?',
      tags: ['NFC', 'Hardware'],
      cover_subject: 'NFC tag used with a smartphone',
      cover_query: 'nfc tag smartphone contactless',
      cover_avoid: 'nfc logo qr code'
    });

    expect(result.subjectAnchors).toContain('nfc');
    expect(result.hardAvoidMatches).not.toContain('nfc');
    expect(result.semanticMismatch).toBe(false);
  });

  it('matches conceptual subjects through reusable visual aliases', () => {
    const rss = scoreHit({
      type: 'illustration',
      tags: 'feed, reader, dashboard, browser, subscription',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      title: 'RSS ist nicht tot',
      tags: ['RSS', 'FreshRSS'],
      cover_query: 'rss feed reader dashboard aggregator browser subscription'
    });

    expect(rss.subjectAnchors).toContain('rss');
    expect(rss.subjectAnchorMatches).toContain('rss');
    expect(rss.subjectAnchorEvidence.rss).toBe('feed');

    const vpc = scoreHit({
      type: 'photo',
      tags: 'network, router, routing, ethernet, topology',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      title: 'Eine VPC ist keine schwarze Magie',
      tags: ['AWS', 'VPC', 'Networking', 'Subnet'],
      cover_query: 'computer network topology router routing subnet infrastructure'
    });

    expect(vpc.subjectAnchors).toContain('vpc');
    expect(vpc.subjectAnchorMatches).toContain('vpc');
    expect(['topology', 'subnet', 'router', 'routing', 'ethernet']).toContain(
      vpc.subjectAnchorEvidence.vpc
    );
  });

  it('allows a literal metal container as a Docker visual metaphor', () => {
    const article = {
      title: 'Docker vs. Docker Compose: Was ist der Unterschied?',
      tags: ['Docker', 'Docker-Compose', 'DevOps'],
      cover_query: 'devops deployment orchestration services architecture workflow container'
    };

    const metalContainer = scoreHit({
      type: 'photo',
      tags: 'shipping container, metal container, cargo container, steel, freight',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const cargoShip = scoreHit({
      type: 'photo',
      tags: 'cargo ship, container ship, port, harbor, freight, shipping',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const mailbox = scoreHit({
      type: 'photo',
      tags: 'wood, outdoors, rural, mailboxes, communication, snail mail, post boxes, rustic, container',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const dockWorkerStatue = scoreHit({
      type: 'photo',
      tags: 'statue, sculpture, iron, steel, docker, finland, hamina',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(metalContainer.semanticMismatch).toBe(false);
    expect(mailbox.semanticMismatch).toBe(true);
    expect(dockWorkerStatue.subjectAnchorMatches).not.toContain('docker');
    expect(dockWorkerStatue.semanticMismatch).toBe(true);
    expect(cargoShip.semanticMismatch).toBe(true);
    expect(cargoShip.hardAvoidMatches).toEqual(expect.arrayContaining(['ship', 'port']));
  });

  it('requires technical context for ambiguous subject aliases such as cluster and container', () => {
    const article = {
      title: 'K3s auf Proxmox – Teil II: GitOps',
      tags: ['Kubernetes', 'K3s', 'Proxmox', 'GitOps'],
      cover_query: 'server datacenter infrastructure network cloud container cluster kubernetes'
    };

    const fruitCluster = scoreHit({
      type: 'photo',
      tags: 'currant, fruits, berries, cluster, harvest, produce, organic',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const metalContainer = scoreHit({
      type: 'photo',
      tags: 'yellow, blue, container, window, color, metal, geometry',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const kubernetesCluster = scoreHit({
      type: 'illustration',
      tags: 'kubernetes, cluster, container, orchestration, server, cloud, infrastructure',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(fruitCluster.subjectAnchors).toContain('k3s');
    expect(fruitCluster.subjectAnchorMatches).toHaveLength(0);
    expect(fruitCluster.semanticMismatch).toBe(true);

    expect(metalContainer.subjectAnchorMatches).toHaveLength(0);
    expect(metalContainer.semanticMismatch).toBe(true);

    expect(kubernetesCluster.subjectAnchorMatches).toContain('k3s');
    expect(kubernetesCluster.semanticMismatch).toBe(false);
  });

  it('turns a blog topic into a concrete website/publishing subject instead of generic analytics', () => {
    const article = {
      title: 'Wie dieser Blog gebaut ist',
      tags: ['Blog', 'Architecture', 'DevOps', 'Node'],
      cover_query: 'website code server publishing deployment automation infrastructure cloud'
    };

    const analytics = scoreHit({
      type: 'illustration',
      tags: 'analytics, information, innovation, communication, big data, cyber security',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const publishing = scoreHit({
      type: 'illustration',
      tags: 'website, publishing, web, code, server, deployment',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(analytics.subjectAnchors).toContain('blog');
    expect(analytics.semanticMismatch).toBe(true);
    expect(publishing.subjectAnchorMatches).toContain('blog');
    expect(publishing.semanticMismatch).toBe(false);
  });

  it('keeps concrete subjects strict when no visual alias is defined', () => {
    const evidence = subjectAnchorEvidence(
      new Set(['smartphone', 'game', 'retro']),
      ['pokemon'],
      visualIntent({
        title: 'Pokémon ist perfekt für OOP',
        tags: ['Pokémon'],
        cover_intent: 'pokemon-oop-domain-model'
      })
    );

    expect(evidence.matches).toHaveLength(0);
    expect(subjectAliasTokens('pokemon')).toEqual(['pokemon']);
  });

  it('builds short subject-aware queries for technical topics without article-specific hacks', () => {
    const k3s = {
      title: 'K3s auf Proxmox – Teil I: Blog-Staging',
      tags: ['Kubernetes', 'K3s', 'Proxmox', 'Cloudflare'],
      cover_query: 'server datacenter infrastructure network cloud container cluster kubernetes'
    };
    const k3sVariants = subjectSearchVariants(k3s);
    expect(k3sVariants).toEqual(expect.arrayContaining([
      'k3s kubernetes',
      'kubernetes cluster'
    ]));
    expect(queryCandidates(k3s).length).toBeGreaterThan(3);

    const rss = {
      title: 'RSS ist nicht tot',
      tags: ['RSS', 'FreshRSS'],
      cover_query: 'rss feed reader dashboard aggregator browser subscription'
    };
    const rssIntent = visualIntent(rss);
    expect(subjectSearchVariants(rss, rssIntent)).toEqual(expect.arrayContaining([
      'rss feed',
      'feed reader'
    ]));

    const immich = {
      title: 'Warum ich Immich nicht synchronisiere',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone'],
      cover_query: 'photo storage server cloud gallery files sync homelab'
    };
    const immichIntent = visualIntent(immich);
    expect(subjectSearchVariants(immich, immichIntent)).toEqual(expect.arrayContaining([
      'immich photo',
      'photo gallery'
    ]));
  });

  it('derives extra search variants from reusable intent vocabulary', () => {
    const systemd = {
      title: 'systemd Services sauber betreiben',
      tags: ['Linux', 'systemd', 'Operations'],
      cover_query: 'linux server administration monitoring service logs daemon'
    };
    const intent = visualIntent(systemd);
    const variants = intentSearchVariants(systemd, intent);
    expect(variants.some((value) => value.includes('service'))).toBe(true);
    expect(queryCandidates(systemd).length).toBeGreaterThan(2);
  });

  it('supports the configured DOOM shareware visual intent', () => {
    const article = {
      title: 'DOOM: Wie Shareware das PC-Gaming veränderte',
      tags: ['DOOM', 'Shareware', 'Retro-Gaming'],
      cover_intent: 'doom-shareware-history',
      cover_query: 'doom retro pc gaming shareware floppy disk 1990s'
    };
    const intent = visualIntent(article);
    expect(intent.key).toBe('doom-shareware-history');

    const floppy = scoreHit({
      type: 'photo',
      tags: 'floppy, disk, retro, computer, dos, data',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const modern = scoreHit({
      type: 'photo',
      tags: 'rgb, laptop, esports, controller, modern gaming',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const genericDisk = scoreHit({
      type: 'photo',
      tags: 'binary, disk, storage, registration, magnetic, device, digital, archive',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(floppy.semanticMismatch).toBe(false);
    expect(genericDisk.semanticMismatch).toBe(true);
    expect(modern.semanticMismatch).toBe(true);
  });

  it('promotes only explicitly curated visual aliases into subject identity', () => {
    const anchors = subjectAnchors({
      title: 'Wie dieser Blog gebaut ist',
      tags: ['Blog', 'Architecture', 'DevOps', 'Node'],
      cover_query: 'website code server publishing deployment automation infrastructure cloud'
    });

    expect(anchors).toContain('blog');
    expect(anchors).not.toContain('devops');
  });

  it('hard-rejects known cross-domain word collisions', () => {
    const cases = [
      {
        article: {
          title: 'logger.info() – wird schon nichts kosten',
          tags: ['AWS', 'CloudWatch', 'Observability', 'Logging'],
          cover_query: 'server logs monitoring metrics observability cloudwatch alerts'
        },
        hit: 'wood, logs, firewood, timber, forest'
      },
      {
        article: {
          title: 'K3s auf Proxmox – Production',
          tags: ['Kubernetes', 'K3s', 'Proxmox'],
          cover_query: 'kubernetes proxmox server datacenter infrastructure'
        },
        hit: 'proxy, proxy server, web proxy, scraping, network'
      },
      {
        article: {
          title: 'Regressionstests – was sie sind',
          tags: ['Testing', 'Regressionstest', 'CI'],
          cover_query: 'software testing quality assurance bug code'
        },
        hit: 'pupil, school, teaching, education, testing, laptop'
      },
      {
        article: {
          title: 'RSS ist nicht tot',
          tags: ['RSS', 'FreshRSS'],
          cover_query: 'rss feed reader dashboard aggregator browser subscription'
        },
        hit: 'kobo, ebook, tablet, reading, reader'
      },
      {
        article: {
          title: 'DOOM: Wie Shareware das PC-Gaming veränderte',
          tags: ['DOOM', 'Shareware', 'Retro-Gaming'],
          cover_intent: 'doom-shareware-history',
          cover_query: 'doom retro pc gaming shareware floppy disk 1990s'
        },
        hit: 'truck, pickup, chevrolet, 1993, 1990s, retro'
      }
    ];

    for (const entry of cases) {
      const result = scoreHit({
        type: 'photo',
        tags: entry.hit,
        imageWidth: 1920,
        imageHeight: 1080
      }, entry.article);
      expect(result.semanticMismatch, entry.hit).toBe(true);
      expect(result.hardAvoidMatches.length, entry.hit).toBeGreaterThan(0);
    }
  });

  it('prefers title-derived subjects over broader tags', () => {
    const docker = subjectAnchors({
      title: 'Docker vs. Docker Compose: Was ist der Unterschied?',
      tags: ['Docker', 'Compose', 'DevOps', 'Automation'],
      cover_query: 'devops deployment orchestration services architecture workflow'
    });

    expect(docker).toEqual(expect.arrayContaining(['docker', 'compose']));
    expect(docker).not.toContain('devops');

    const blog = subjectAnchors({
      title: 'Wie dieser Blog gebaut ist',
      tags: ['Blog', 'Architecture', 'DevOps', 'Node'],
      cover_query: 'website code server publishing deployment automation infrastructure cloud'
    });

    expect(blog).toContain('blog');
    expect(blog).not.toContain('devops');
  });

  it('rejects generic stock motifs for concrete technical intents', () => {
    const cases = [
      {
        article: {
          title: 'Dependabot im Einsatz',
          tags: ['Dependabot', 'GitHub', 'Dependencies'],
          cover_query: 'software dependency package update code github vulnerability'
        },
        hit: 'analytics, information, innovation, communication, big data, cyber security'
      },
      {
        article: {
          title: 'Dependabot im Einsatz',
          tags: ['Dependabot', 'GitHub', 'Dependencies'],
          cover_query: 'software dependency package update code github vulnerability'
        },
        hit: 'mobile, hand, technology, communication, wireless, dependency, gambling'
      },
      {
        article: {
          title: 'Dependabot im Einsatz',
          tags: ['Dependabot', 'GitHub', 'Dependencies'],
          cover_query: 'software dependency package update code github vulnerability'
        },
        hit: 'chemistry, structural formula, harmful, addicted, tablets, dependency, drugs'
      },
      {
        article: {
          title: 'Kernel Grep: semantische Suche',
          tags: ['Semantic-Search', 'Embeddings', 'Kernel-Grep'],
          cover_query: 'search data code analytics magnifying glass'
        },
        hit: 'ball, binary, computer data, binary matrix, digital binary'
      },
      {
        article: {
          title: 'Kernel Grep: semantische Suche',
          tags: ['Semantic-Search', 'Embeddings', 'Kernel-Grep'],
          cover_query: 'search data code analytics magnifying glass'
        },
        hit: 'philatelist, stamp collection, stamp, collecting, collection, glass, zoom, detail'
      },
      {
        article: {
          title: 'systemd Services sauber betreiben',
          tags: ['Linux', 'systemd', 'Operations'],
          cover_query: 'linux server administration monitoring service logs daemon'
        },
        hit: 'cyberspace, data, wire, electronic, ethernet, infrastructure, cable, computer'
      },
      {
        article: {
          title: 'systemd Services sauber betreiben',
          tags: ['Linux', 'systemd', 'Operations'],
          cover_query: 'linux server administration monitoring service logs daemon'
        },
        hit: 'cloud, monitor, cloud computing, data store, capacity, network, services, disk space'
      },
      {
        article: {
          title: 'Regressionstests – was sie sind',
          tags: ['Testing', 'Regressionstest', 'CI'],
          cover_query: 'software testing quality assurance bug code'
        },
        hit: 'marketing, development, software, usefulness, consumer-friendly, quality, cost'
      },
      {
        article: {
          title: 'Regressionstests – was sie sind',
          tags: ['Testing', 'Regressionstest', 'CI'],
          cover_query: 'software testing quality assurance bug code'
        },
        hit: 'scan, system, bug, virus, malware, search, error, code, alert'
      }
    ];

    for (const entry of cases) {
      const result = scoreHit({
        type: 'illustration',
        tags: entry.hit,
        imageWidth: 1920,
        imageHeight: 1080
      }, entry.article);

      expect(result.semanticMismatch, entry.hit).toBe(true);
    }
  });

  it('uses a curated subject anchor before broad lexical topic evidence', () => {
    const article = {
      title: 'Wie dieser Blog gebaut ist',
      category: 'Engineering',
      tags: ['Blog', 'Architecture', 'DevOps', 'Node'],
      cover_query: 'website code server publishing deployment automation infrastructure cloud'
    };

    const unrelated = scoreHit({
      type: 'illustration',
      tags: 'analytics, information, innovation, communication, big data, cyber security',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const relevant = scoreHit({
      type: 'illustration',
      tags: 'website, publishing, web, code, server, deployment, infrastructure, cloud',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(unrelated.subjectAnchorRequired).toBe(true);
    expect(unrelated.subjectAnchorMatches).toHaveLength(0);
    expect(unrelated.semanticMismatch).toBe(true);
    expect(relevant.subjectAnchorMatches).toContain('blog');
    expect(relevant.semanticMismatch).toBe(false);
  });

  it('uses a Pac-Man-specific arcade intent instead of generic retro hardware', () => {
    const article = {
      title: 'Warum Pac-Man zuerst Puck Man hieß – und was パクパク damit zu tun hat',
      category: 'Gaming',
      tags: ['Pac-Man', 'Puck-Man', 'Arcade', 'Retro-Gaming'],
      cover_intent: 'pacman-arcade',
      cover_query: 'pacman maze arcade yellow character ghost chase retro'
    };

    const intent = visualIntent(article);
    expect(intent.key).toBe('pacman-arcade');
    expect(intent.explicit).toBe(true);
    expect(queryCandidates(article)[0]).toBe(
      'pacman maze arcade yellow character ghost chase retro'
    );

    const maze = scoreHit({
      type: 'illustration',
      tags: 'pacman, maze, arcade, yellow, ghost, chase, retro, game',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const genericHardware = scoreHit({
      type: 'illustration',
      tags: 'retro, 8bit, computer, keyboard, monitor, space invaders, atari, sega, game',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(maze.semanticMismatch).toBe(false);
    expect(genericHardware.semanticMismatch).toBe(true);
    expect(maze.score).toBeGreaterThan(genericHardware.score);
  });

  it('fails closed for unknown explicit cover intents', () => {
    expect(() => visualIntent({
      title: 'Example',
      cover_intent: 'does-not-exist'
    })).toThrow('Unknown cover_intent "does-not-exist"');
  });

  it('rejects mobile Pokémon-Go imagery for the handheld/game intent', () => {
    const result = scoreHit({
      type: 'illustration',
      tags: 'pokemon, smartphone, pokemon go, virtual, game, iphone, reality, mobile',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      tags: ['Pokémon', 'Java', 'OOP'],
      cover_intent: 'pokemon-oop-domain-model',
      cover_query: 'pokemon game handheld battle'
    });

    expect(result.semanticMismatch).toBe(true);
    expect(result.hardAvoidMatches).toEqual(
      expect.arrayContaining(['smartphone', 'iphone', 'mobile'])
    );
  });

  it('rejects a semantically adjacent but wrong franchise for Pokémon covers', () => {
    const article = {
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      category: 'Engineering',
      tags: ['Pokémon', 'Java', 'OOP', 'Domain-Modeling'],
      cover_intent: 'pokemon-oop-domain-model',
      cover_subject: 'Pokémon game scene or handheld Pokémon game with clear franchise context',
      cover_query: 'pokemon game handheld battle',
      cover_avoid: 'logo trading cards phone laptop office keyboard code screenshot text'
    };

    const intent = visualIntent(article);
    expect(intent.key).toBe('pokemon-oop-domain-model');
    expect(intent.explicit).toBe(true);

    const mario = scoreHit({
      type: 'photo',
      tags: 'mario, figure, game, nintendo, super, retro, classic, computer game, character, cartoon, video, games console, super mario bros, marios',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const pokemonGame = scoreHit({
      type: 'illustration',
      tags: 'pokemon, pikachu, game, handheld, battle, rpg',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(mario.semanticMismatch).toBe(true);
    expect(mario.hardAvoidMatches).toContain('mario');
    expect(pokemonGame.semanticMismatch).toBe(false);
    expect(pokemonGame.hardAvoidMatches).not.toContain('pokemon');
    expect(pokemonGame.hardAvoidMatches).not.toContain('pikachu');
    expect(pokemonGame.score).toBeGreaterThan(mario.score);
  });

  it('rejects a retro creature motif when there is no actual battle or game scene', () => {
    const article = {
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      category: 'Engineering',
      tags: ['Pokémon', 'Java', 'OOP', 'Domain-Modeling'],
      cover_intent: 'pokemon-oop-domain-model',
      cover_subject: 'Pokémon game scene or handheld Pokémon game with clear franchise context'
    };

    const cassetteDragon = scoreHit({
      type: 'illustration',
      tags: 'cassette, tape, pixel art, pixel, recorder, retro, classic, music, dragon, reptile, creature, fantasy',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const genericMonsterBattle = scoreHit({
      type: 'illustration',
      tags: 'handheld, game, rpg, creature, monster, fantasy, battle, combat, duel',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const pokemonBattle = scoreHit({
      type: 'illustration',
      tags: 'pokemon, pokeball, handheld, game, battle',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(cassetteDragon.semanticMismatch).toBe(true);
    expect(cassetteDragon.hardAvoidMatches).toEqual(expect.arrayContaining(['cassette', 'tape', 'music']));
    expect(genericMonsterBattle.semanticMismatch).toBe(true);
    expect(pokemonBattle.semanticMismatch).toBe(false);
    expect(pokemonBattle.score).toBeGreaterThan(genericMonsterBattle.score);
  });

  it('rejects adjacent fantasy and sci-fi battle franchises for Pokémon covers', () => {
    const article = {
      title: 'Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist',
      category: 'Engineering',
      tags: ['Pokémon', 'Java', 'OOP', 'Domain-Modeling'],
      cover_intent: 'pokemon-oop-domain-model',
      cover_subject: 'turn based handheld game battle with two fantasy creatures facing each other'
    };

    const dndDragon = scoreHit({
      type: 'illustration',
      tags: 'dnd, rpg, dragon, wyvern, fantasy, creature, monster, rider, medieval, warrior, knight, soldier, war, battle',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const alienBattle = scoreHit({
      type: 'photo',
      tags: 'alien, battle, fantasy, ufo, spaceship, action, fight, game, ninja turtle, sci-fi',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    const genericCreatureDuel = scoreHit({
      type: 'illustration',
      tags: 'handheld, game, rpg, creature, monster, fantasy, battle, combat, duel',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const pokemonBattle = scoreHit({
      type: 'illustration',
      tags: 'pokemon, pikachu, handheld, game, battle',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(dndDragon.semanticMismatch).toBe(true);
    expect(alienBattle.semanticMismatch).toBe(true);
    expect(genericCreatureDuel.semanticMismatch).toBe(true);
    expect(pokemonBattle.semanticMismatch).toBe(false);
  });

  it('treats explicit cover_avoid terms as semantic blockers, not only score penalties', () => {
    const result = scoreHit({
      type: 'photo',
      tags: 'server, cloud, office, laptop',
      imageWidth: 1920,
      imageHeight: 1080
    }, {
      title: 'Cloud architecture',
      cover_avoid: 'office laptop'
    });

    expect(result.hardAvoidMatches).toEqual(expect.arrayContaining(['office', 'laptop']));
    expect(result.semanticMismatch).toBe(true);
  });

  it('allows one article to override the automatic Chaos Monkey animal intent', () => {
    const article = {
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      category: 'DevOps',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience'],
      cover_query: 'server datacenter infrastructure network cloud',
      cover_intent: 'chaos-engineering'
    };

    const intent = visualIntent(article);
    expect(intent.key).toBe('chaos-engineering');
    expect(intent.explicit).toBe(true);
    expect(intent.pixabayCategory).toBe('computer');
    expect(queryCandidates(article)[0]).toBe(
      'server monitoring outage incident failure resilience reliability'
    );
  });

  it('ranks the article image idea above generic metadata matches', () => {
    const writing = {
      title: 'Fehlerarme Texte trotz Legasthenie: meine Rechtschreib-Pipeline',
      category: 'Automation',
      tags: ['GitHub-Actions', 'Automation', 'CSpell', 'LanguageTool']
    };
    const relevantWriting = scoreHit({
      tags: 'writing, keyboard, document, spelling, text, editing',
      imageWidth: 1920,
      imageHeight: 1080
    }, writing);
    const genericWriting = scoreHit({
      tags: 'secretary, desk, office automation, telephone, sales, screen',
      imageWidth: 1920,
      imageHeight: 1080
    }, writing);

    expect(relevantWriting.score).toBeGreaterThan(genericWriting.score);
    expect(relevantWriting.semanticMismatch).toBe(false);
    expect(genericWriting.semanticMismatch).toBe(true);

    const rss = {
      title: 'RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung',
      category: 'Self-Hosting',
      tags: ['RSS', 'FreshRSS', 'Miniflux']
    };
    expect(
      scoreHit({
        tags: 'rss, feed, reader, subscription, aggregator, website',
        imageWidth: 1920,
        imageHeight: 1080
      }, rss).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'server, drive bay, hard drives, storage, network, database',
        imageWidth: 1920,
        imageHeight: 1080
      }, rss).score
    );

    const rssSpeedDashboard = scoreHit({
      tags: 'speed, internet, download, upload, broadband, dashboard, website, server',
      imageWidth: 1920,
      imageHeight: 1080
    }, rss);
    expect(rssSpeedDashboard.semanticMismatch).toBe(true);

    const dependabot = {
      title: 'Dependabot im Einsatz',
      category: 'Security',
      tags: ['GitHub', 'Dependabot', 'Security', 'Supply-Chain']
    };
    expect(
      scoreHit({
        tags: 'software, dependency, package, update, code, vulnerability',
        imageWidth: 1920,
        imageHeight: 1080
      }, dependabot).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'wall safe, secure, lock, key, insurance, security',
        imageWidth: 1920,
        imageHeight: 1080
      }, dependabot).score
    );

    const vpc = {
      title: 'Eine VPC ist keine schwarze Magie',
      category: 'AWS',
      tags: ['AWS', 'VPC', 'Networking', 'Subnet', 'Route-Table']
    };
    expect(
      scoreHit({
        tags: 'network, topology, router, routing, cloud, connection',
        imageWidth: 1920,
        imageHeight: 1080
      }, vpc).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'server, datacenter, database, cloud, business',
        imageWidth: 1920,
        imageHeight: 1080
      }, vpc).score
    );

    const chaos = {
      title: 'Chaos Engineering systematisch testen',
      category: 'DevOps',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience', 'Observability', 'Testing']
    };
    expect(
      scoreHit({
        tags: 'testing, failure, monitoring, reliability, experiment, observability',
        imageWidth: 1920,
        imageHeight: 1080
      }, chaos).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'server, cloud, development, business, database, management',
        imageWidth: 1920,
        imageHeight: 1080
      }, chaos).score
    );
  });

  it('chooses the most specific visual intent instead of the first matching implementation tag', () => {
    const kernelGrep = {
      title: 'Kernel Grep: Wie ich meinem Blog eine semantische Suche gebaut habe',
      category: 'Engineering',
      tags: ['Semantic-Search', 'DuckDB', 'Embeddings', 'Docker', 'Self-Hosting', 'Kernel-Grep']
    };

    const intent = visualIntent(kernelGrep);
    expect(intent.key).toBe('semantic-search');
    expect(intent.matchedMarkers.length).toBeGreaterThan(1);
  });

  it('prefers an actual monkey motif over generic error symbols for Chaos Monkey', () => {
    const article = {
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      category: 'DevOps',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience', 'Observability']
    };

    const monkey = scoreHit({
      tags: 'monkey, ape, primate, chimpanzee, animal',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);
    const errorIcon = scoreHit({
      tags: 'error, cross, warning, sign, icon, symbol, interface',
      imageWidth: 1920,
      imageHeight: 1080
    }, article);

    expect(monkey.score).toBeGreaterThan(errorIcon.score);
    expect(monkey.semanticMismatch).toBe(false);
    expect(errorIcon.semanticMismatch).toBe(true);
  });

  it('rejects literal keyword collisions for systemd, Docker, VPC, RSS and Chaos Engineering', () => {
    const systemd = {
      title: 'systemd Services sauber betreiben',
      category: 'Linux',
      tags: ['Linux', 'systemd', 'Operations', 'Reliability']
    };
    expect(
      scoreHit({
        tags: 'linux, shell, console, service, logs, command',
        imageWidth: 1920,
        imageHeight: 1080
      }, systemd).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'train, subway, train station, terminal, airport, transport',
        imageWidth: 1920,
        imageHeight: 1080
      }, systemd).score
    );

    const docker = {
      title: 'Docker vs. Docker Compose: Was ist der Unterschied?',
      category: 'DevOps',
      tags: ['Docker', 'DevOps', 'Operations', 'Architecture']
    };
    expect(
      scoreHit({
        tags: 'devops, software, development, code, deployment, programming',
        imageWidth: 1920,
        imageHeight: 1080
      }, docker).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'can, metal box, storage, container, jar, vessel',
        imageWidth: 1920,
        imageHeight: 1080
      }, docker).score
    );

    const vpc = {
      title: 'Eine VPC ist keine schwarze Magie',
      category: 'AWS',
      tags: ['AWS', 'VPC', 'Networking', 'Subnet', 'Route-Table', 'Internet-Gateway']
    };
    const networkDiagram = scoreHit({
      tags: 'network topology, router, routing, subnet, infrastructure, ethernet',
      imageWidth: 1920,
      imageHeight: 1080
    }, vpc);
    const socialNetwork = scoreHit({
      tags: 'social media, connection, icons, internet, online, communication, network',
      imageWidth: 1920,
      imageHeight: 1080
    }, vpc);
    expect(networkDiagram.score).toBeGreaterThan(socialNetwork.score);
    expect(socialNetwork.semanticMismatch).toBe(true);

    const rss = {
      title: 'RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung',
      tags: ['RSS', 'FreshRSS', 'Miniflux', 'Self-Hosting']
    };
    expect(
      scoreHit({
        tags: 'rss, feed, reader, subscription, aggregator, website',
        imageWidth: 1920,
        imageHeight: 1080
      }, rss).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'press, journalist, photographer, news, newspaper, reporter',
        imageWidth: 1920,
        imageHeight: 1080
      }, rss).score
    );

    const chaos = {
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
      tags: ['Chaos-Engineering', 'Kubernetes', 'SRE', 'Resilience', 'Observability']
    };
    const resilience = scoreHit({
      tags: 'resilience, reliability, monitoring, outage, failure, infrastructure, incident',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    const laboratory = scoreHit({
      tags: 'testing, experiment, chemistry, laboratory, school, examination, medical',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    expect(resilience.score).toBeGreaterThan(laboratory.score);
    expect(laboratory.semanticMismatch).toBe(true);
  });

  it('weights the article main topic above incidental examples', () => {
    const regression = {
      title: 'Regressionstests – was sie sind und wie ich sie nutze',
      category: 'Development',
      excerpt: 'Regressionstests prüfe ich unter anderem an meiner semantischen Suche Kernel Grep.',
      tags: ['Testing', 'Regressionstest', 'CI', 'Semantic-Search', 'Kernel-Grep'],
      search_queries: [
        { query: 'Wie teste ich eine semantische Suche automatisch?' }
      ]
    };

    expect(visualIntent(regression).key).toBe('regression-testing');

    const semanticEvidence = visualIntentEvidence(
      regression,
      VISUAL_INTENTS.find((intent) => intent.key === 'semantic-search')
    );
    const regressionEvidence = visualIntentEvidence(
      regression,
      VISUAL_INTENTS.find((intent) => intent.key === 'regression-testing')
    );
    expect(regressionEvidence.evidenceScore).toBeGreaterThan(semanticEvidence.evidenceScore);

    const k3sHardening = {
      title: 'K3s auf Proxmox – Teil III: Feste Versionen und verschlüsselte Secrets',
      category: 'DevOps',
      tags: ['Kubernetes', 'K3s', 'Proxmox', 'Hardening', 'Observability'],
      excerpt: 'Feste Versionen, verschlüsselte Secrets und Backups.'
    };
    expect(visualIntent(k3sHardening)).toBeNull();

    const logger = {
      title: 'logger.info() – wird schon nichts kosten',
      category: 'AWS',
      tags: ['CloudWatch', 'Observability', 'Logging']
    };
    expect(visualIntent(logger).key).toBe('logging-observability');
  });

  it('rejects remaining console, monitoring and physical-storage stock collisions', () => {
    const systemd = {
      title: 'systemd Services sauber betreiben',
      tags: ['Linux', 'systemd', 'Operations']
    };
    const linuxShell = scoreHit({
      tags: 'linux, shell, command, daemon, service, code, logs',
      imageWidth: 1920,
      imageHeight: 1080
    }, systemd);
    const gameConsole = scoreHit({
      tags: 'playstation, computer, console, controller, game, gamer, gaming, sony',
      imageWidth: 1920,
      imageHeight: 1080
    }, systemd);
    expect(linuxShell.score).toBeGreaterThan(gameConsole.score);
    expect(gameConsole.semanticMismatch).toBe(true);

    const chaos = {
      title: 'Chaos Engineering systematisch testen',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience', 'Observability']
    };
    const monitoring = scoreHit({
      tags: 'server, monitoring, dashboard, alert, outage, infrastructure, reliability',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    const cloudTouch = scoreHit({
      tags: 'cloud, finger, touch, cloud computing, data store, network, server',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    expect(monitoring.score).toBeGreaterThan(cloudTouch.score);
    expect(cloudTouch.semanticMismatch).toBe(true);

    const photos = {
      title: 'Warum ich Immich nicht synchronisiere: WebDAV, rclone und Provisionierung statt Dateikopien',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone', 'Self-Hosting']
    };
    const photoSync = scoreHit({
      tags: 'photo, gallery, digital, images, files, cloud, sync',
      imageWidth: 1920,
      imageHeight: 1080
    }, photos);
    const miniStorage = scoreHit({
      tags: 'mini storage, music library, mini warehouse, self storage',
      imageWidth: 1920,
      imageHeight: 1080
    }, photos);
    expect(photoSync.score).toBeGreaterThan(miniStorage.score);
    expect(miniStorage.semanticMismatch).toBe(true);

    const logging = {
      title: 'logger.info() – wird schon nichts kosten',
      tags: ['AWS', 'CloudWatch', 'Observability', 'Logging']
    };
    expect(
      scoreHit({
        tags: 'logs, monitoring, dashboard, metrics, observability, alerts',
        imageWidth: 1920,
        imageHeight: 1080
      }, logging).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'binary, smartphone, photography, software, code',
        imageWidth: 1920,
        imageHeight: 1080
      }, logging).score
    );
  });

  it('requires unambiguous intent groups for the remaining stock-photo collisions', () => {
    const systemd = {
      title: 'systemd Services sauber betreiben',
      tags: ['Linux', 'systemd', 'Operations']
    };
    const systemdGood = scoreHit({
      tags: 'linux, shell, command, daemon, service, logs',
      imageWidth: 1920,
      imageHeight: 1080
    }, systemd);
    const systemdBinary = scoreHit({
      tags: 'binary, smartphone, photography, programming, computer, server, code',
      imageWidth: 1920,
      imageHeight: 1080
    }, systemd);
    expect(systemdGood.semanticMismatch).toBe(false);
    expect(systemdBinary.semanticMismatch).toBe(true);
    expect(systemdGood.score).toBeGreaterThan(systemdBinary.score);

    const chaos = {
      title: 'Chaos Engineering systematisch testen',
      tags: ['Chaos-Engineering', 'Kubernetes', 'Resilience', 'Observability']
    };
    const chaosGood = scoreHit({
      tags: 'server, monitoring, alert, outage, infrastructure, reliability',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    const genericServer = scoreHit({
      tags: 'network, server, system, infrastructure, managed services, cloud',
      imageWidth: 1920,
      imageHeight: 1080
    }, chaos);
    expect(chaosGood.semanticMismatch).toBe(false);
    expect(genericServer.semanticMismatch).toBe(true);
    expect(chaosGood.score).toBeGreaterThan(genericServer.score);

    const logging = {
      title: 'logger.info() – wird schon nichts kosten',
      tags: ['AWS', 'CloudWatch', 'Observability', 'Logging']
    };
    const loggingGood = scoreHit({
      tags: 'server, logs, monitoring, metrics, observability, alerts',
      imageWidth: 1920,
      imageHeight: 1080
    }, logging);
    const carDashboard = scoreHit({
      tags: 'speedometer, dashboard, car, speed, vehicle, automobile',
      imageWidth: 1920,
      imageHeight: 1080
    }, logging);
    expect(loggingGood.semanticMismatch).toBe(false);
    expect(carDashboard.semanticMismatch).toBe(true);
    expect(loggingGood.score).toBeGreaterThan(carDashboard.score);

    const photos = {
      title: 'Warum ich Immich nicht synchronisiere: WebDAV, rclone und Provisionierung statt Dateikopien',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone', 'Self-Hosting']
    };
    const photoCloud = scoreHit({
      tags: 'photo, gallery, cloud, files, sync, backup, image',
      imageWidth: 1920,
      imageHeight: 1080
    }, photos);
    const airplanePhotoArt = scoreHit({
      tags: 'airplane, jet, fighter, aircraft, military, digital manipulation, photo art',
      imageWidth: 1920,
      imageHeight: 1080
    }, photos);
    const cameraOnly = scoreHit({
      tags: 'camera, digital, photo, image, photography',
      imageWidth: 1920,
      imageHeight: 1080
    }, photos);
    expect(photoCloud.semanticMismatch).toBe(false);
    expect(airplanePhotoArt.semanticMismatch).toBe(true);
    expect(cameraOnly.semanticMismatch).toBe(true);
    expect(photoCloud.score).toBeGreaterThan(airplanePhotoArt.score);
  });

  it('uses focused fallback queries when an article query returns no result', () => {
    expect(queryCandidates({
      title: 'Ein deutscher Titel',
      category: 'DevOps',
      tags: ['Kubernetes', 'Cloudflare']
    }, 'specific query')).toEqual([
      'specific query',
      'server datacenter infrastructure network cloud container cluster security',
      'DevOps Kubernetes Cloudflare'
    ]);
  });

  it('builds visual search terms for niche infrastructure topics', () => {
    expect(visualQuery({
      title: 'K3s auf Proxmox',
      category: 'DevOps',
      tags: ['Kubernetes', 'K3s', 'Proxmox']
    })).toContain('server');
    expect(visualQuery({
      title: 'K3s auf Proxmox',
      category: 'DevOps',
      tags: ['Kubernetes', 'K3s', 'Proxmox']
    })).toContain('datacenter');
  });

  it('penalizes military deployment and K3 train false positives', () => {
    const deploymentArticle = {
      title: 'Deployment mit Hetzner, Docker und Cloudflare Zero Trust',
      category: 'DevOps',
      tags: ['Hetzner', 'Docker', 'Cloudflare']
    };
    const military = {
      tags: 'afghanistan, soldier, weapon, patrol, deployment, security',
      imageWidth: 1920,
      imageHeight: 1080
    };
    const infrastructure = {
      tags: 'server, datacenter, cloud, network, infrastructure, security',
      imageWidth: 1920,
      imageHeight: 1080
    };

    expect(scoreHit(infrastructure, deploymentArticle).score)
      .toBeGreaterThan(scoreHit(military, deploymentArticle).score);

    const k3sArticle = {
      title: 'K3s auf Proxmox',
      category: 'DevOps',
      tags: ['Kubernetes', 'K3s', 'Proxmox']
    };
    const train = {
      tags: 'train, mist, k3, mongolia, railway',
      imageWidth: 1920,
      imageHeight: 1080
    };
    const server = {
      tags: 'server, datacenter, infrastructure, network, cloud',
      imageWidth: 1920,
      imageHeight: 1080
    };

    expect(scoreHit(server, k3sArticle).score)
      .toBeGreaterThan(scoreHit(train, k3sArticle).score);
    expect(scoreHit(train, k3sArticle).score).toBeLessThan(30);
  });

  it('penalizes literal shipping imagery for Docker articles', () => {
    const article = {
      title: 'Docker vs Docker Compose',
      category: 'DevOps',
      tags: ['Docker', 'Compose']
    };
    const ship = {
      tags: 'ship, cargo, port, docker, shipping, freight',
      imageWidth: 1920,
      imageHeight: 1080
    };
    const software = {
      tags: 'devops, software, code, deployment, technology',
      imageWidth: 1920,
      imageHeight: 1080
    };

    expect(scoreHit(software, article).score)
      .toBeGreaterThan(scoreHit(ship, article).score);
  });

  it('combines and de-duplicates candidates from all article search paths', async () => {
    const searchImpl = globalThis.vi.fn(async (query) => {
      if (query === 'primary') {
        return [
          { id: 1, tags: 'server, cloud' },
          { id: 2, tags: 'network, infrastructure' }
        ];
      }
      if (query === 'fallback') {
        return [
          { id: 2, tags: 'network, infrastructure' },
          { id: 3, tags: 'storage, server' }
        ];
      }
      return [{ id: 4, tags: 'terminal, linux' }];
    });

    const hits = await collectCandidates(
      ['primary', 'fallback', 'title'],
      'secret',
      { searchImpl }
    );

    expect(searchImpl).toHaveBeenCalledTimes(3);
    expect(hits.map((hit) => hit.id)).toEqual([1, 2, 3, 4]);
    expect(hits[1].__coverQueries).toEqual(['primary', 'fallback']);
    expect(hits[2].__coverQuery).toBe('fallback');
  });

  it('keeps an already collected candidate pool when Pixabay starts rate limiting', async () => {
    const searchImpl = globalThis.vi.fn(async (query) => {
      if (query === 'primary') {
        return [
          { id: 1, tags: 'dependency, package, update, software' },
          { id: 2, tags: 'github, repository, code' }
        ];
      }
      throw new Error('Pixabay search failed with HTTP 429');
    });

    const hits = await collectCandidates(
      ['primary', 'fallback', 'extra'],
      'secret',
      { searchImpl }
    );

    expect(searchImpl).toHaveBeenCalledTimes(2);
    expect(hits.map((hit) => hit.id)).toEqual([1, 2]);
  });

  it('paces successive live Pixabay queries to stay below burst limits', async () => {
    const sleep = globalThis.vi.fn(async () => {});
    const searchImpl = searchPixabayCached;
    const fetchImpl = globalThis.vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ hits: [] })
    }));

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pixabay-pacing-'));
    try {
      await collectCandidates(
        ['one', 'two', 'three'],
        'test-key',
        {
          searchImpl,
          requestDelayMs: 850,
          sleep,
          searchOptions: {
            cacheDir: tmp,
            fetchImpl,
            sleep
          }
        }
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 850);
    expect(sleep).toHaveBeenNthCalledWith(2, 850);
  });

  it('ranks technically relevant images above generic people stock photos', () => {
    const article = {
      title: 'Warum ich Immich nicht synchronisiere',
      category: 'Self-Hosting',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone']
    };
    const technical = {
      id: 1,
      tags: 'photo, gallery, storage, cloud, files, network',
      imageWidth: 1920,
      imageHeight: 1080,
      downloads: 5000,
      likes: 120
    };
    const generic = {
      id: 2,
      tags: 'people, meeting, office, teamwork, portrait',
      imageWidth: 1920,
      imageHeight: 1080,
      downloads: 50000,
      likes: 2000
    };

    expect(scoreHit(technical, article, 'self hosted photo storage').score)
      .toBeGreaterThan(scoreHit(generic, article, 'self hosted photo storage').score);

    const ranked = rankCandidates([generic, technical], article, 'self hosted photo storage');
    expect(ranked[0].hit.id).toBe(1);
  });

  it('renders ranked candidate previews with scores for editorial review', () => {
    const ranked = rankCandidates([
      {
        id: 42,
        tags: 'server, storage, cloud',
        user: 'Example',
        pageURL: 'https://pixabay.com/photos/example-42/',
        previewURL: 'https://cdn.example.test/preview.jpg',
        imageWidth: 1920,
        imageHeight: 1080
      }
    ], {
      category: 'Self-Hosting',
      tags: ['Nextcloud', 'WebDAV']
    }, 'storage server');

    const markdown = renderCandidates(ranked, 3);
    expect(markdown).toContain('Score');
    expect(markdown).toContain('![Kandidat 1](https://cdn.example.test/preview.jpg)');
    expect(markdown).toContain('Pixabay');
  });

  it('caches Pixabay API responses for 24 hours without storing the API key', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixabay-cache-'));
    const fetchImpl = globalThis.vi.fn(async () => ({
      ok: true,
      json: async () => ({ hits: [{ id: 42, pageURL: 'https://pixabay.com/photos/example-42/' }] })
    }));

    try {
      const first = await searchPixabayCached('kubernetes', 'super-secret', {
        cacheDir,
        fetchImpl,
        now: 1_000
      });
      const second = await searchPixabayCached('kubernetes', 'super-secret', {
        cacheDir,
        fetchImpl,
        now: 1_000 + PIXABAY_CACHE_TTL_MS - 1
      });

      expect(first).toEqual(second);
      expect(fetchImpl).toHaveBeenCalledOnce();

      const files = await fs.readdir(cacheDir);
      const cached = await fs.readFile(path.join(cacheDir, files[0]), 'utf8');
      expect(cached).not.toContain('super-secret');
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('keeps Pixabay cache entries separate by category', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixabay-category-cache-'));
    const fetchImpl = globalThis.vi.fn(async (url) => {
      const parsed = new URL(url);
      return {
        ok: true,
        json: async () => ({
          hits: [{ id: parsed.searchParams.get('category') === 'computer' ? 1 : 2 }]
        })
      };
    });

    try {
      const computer = await searchPixabayCached('monitoring', 'secret', {
        cacheDir,
        fetchImpl,
        category: 'computer',
        now: 1000
      });
      const unrestricted = await searchPixabayCached('monitoring', 'secret', {
        cacheDir,
        fetchImpl,
        category: '',
        now: 1000
      });

      expect(computer[0].id).toBe(1);
      expect(unrestricted[0].id).toBe(2);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect((await fs.readdir(cacheDir))).toHaveLength(2);
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('rejects a selected candidate that Pixabay did not return', async () => {
    await expect(choosePhoto([{ id: 1 }], 2)).rejects.toThrow(
      'Selected Pixabay candidate 2 is unavailable'
    );
  });

  it('downloads the selected image without exposing the API key', async () => {
    const bytes = Buffer.from('image-bytes');
    const fetchImpl = globalThis.vi.fn(async (url) => {
      expect(url).toBe('https://cdn.example.test/large.jpg');
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => bytes
      };
    });

    const result = await downloadPhoto({
      largeImageURL: 'https://cdn.example.test/large.jpg'
    }, fetchImpl);

    expect(result.buffer.equals(bytes)).toBe(true);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('retries transient Pixabay CDN rate limits before failing the deployment', async () => {
    const bytes = Buffer.from('image-after-retry');
    let attempt = 0;
    const fetchImpl = globalThis.vi.fn(async () => {
      attempt += 1;
      if (attempt < 3) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null }
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
        arrayBuffer: async () => bytes
      };
    });
    const sleep = globalThis.vi.fn(async () => {});

    const result = await downloadPhoto({
      largeImageURL: 'https://cdn.example.test/rate-limited.jpg'
    }, fetchImpl, { sleep, maxAttempts: 4 });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.buffer.equals(bytes)).toBe(true);
  });

  it('selects a stable local extension from image metadata', () => {
    expect(fileExtension('https://cdn.test/photo.png', 'image/png')).toBe('png');
    expect(fileExtension('https://cdn.test/photo.webp', 'image/webp')).toBe('webp');
    expect(fileExtension('https://cdn.test/photo_1280.jpg', 'image/jpeg')).toBe('jpg');
  });
});
