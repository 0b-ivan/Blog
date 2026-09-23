const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const {
  PIXABAY_CACHE_TTL_MS,
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
  visualQuery,
  rankCandidates,
  renderCandidates,
  scoreHit,
  searchPixabay,
  searchPixabayCached
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

  it('calls Pixabay search with safe landscape photo filters', async () => {
    const fetchImpl = globalThis.vi.fn(async (url) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://pixabay.com');
      expect(parsed.searchParams.get('q')).toBe('kubernetes datacenter');
      expect(parsed.searchParams.get('image_type')).toBe('photo');
      expect(parsed.searchParams.get('orientation')).toBe('horizontal');
      expect(parsed.searchParams.get('safesearch')).toBe('true');
      expect(parsed.searchParams.get('per_page')).toBe('20');
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

    expect(visualIntent({
      title: 'RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung',
      tags: ['RSS', 'FreshRSS', 'Miniflux']
    }).key).toBe('rss-reader');

    expect(visualIntent({
      title: 'Eine VPC ist keine schwarze Magie',
      tags: ['AWS', 'VPC', 'Networking', 'Subnet']
    }).key).toBe('vpc-networking');
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
        tags: 'rss, feed, news, reader, article, reading',
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
      title: 'Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen',
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
        tags: 'rss, feed, news, article, newspaper, subscription',
        imageWidth: 1920,
        imageHeight: 1080
      }, rss).score
    ).toBeGreaterThan(
      scoreHit({
        tags: 'books, bookstore, reading, reader, library, novels',
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

  it('ranks technically relevant images above generic people stock photos', () => {
    const article = {
      title: 'Warum ich Immich nicht synchronisiere',
      category: 'Self-Hosting',
      tags: ['Immich', 'Nextcloud', 'WebDAV', 'rclone']
    };
    const technical = {
      id: 1,
      tags: 'server, storage, cloud, files, network',
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

  it('selects a stable local extension from image metadata', () => {
    expect(fileExtension('https://cdn.test/photo.png', 'image/png')).toBe('png');
    expect(fileExtension('https://cdn.test/photo.webp', 'image/webp')).toBe('webp');
    expect(fileExtension('https://cdn.test/photo_1280.jpg', 'image/jpeg')).toBe('jpg');
  });
});
