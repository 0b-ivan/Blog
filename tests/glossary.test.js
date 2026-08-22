const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
  createApp,
  readPosts
} = require('../server');
const {
  glossaryEntries
} = require('../lib/glossary');
const {
  END_MARKER,
  START_MARKER,
  syncMarkdown,
  usedGlossaryLabels
} = require('../scripts/sync-glossary');

describe('glossary', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-glossary-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('renders glossary terms with markdown-it-abbr without touching inline code', async () => {
    await fs.writeFile(
      path.join(tempDir, '2026-08-22-netzwerk.md'),
      `---\ntitle: Netzwerk\ndate: 2026-08-22\n---\n\nEine VPC verwendet einen CIDR-Block. Im Code bleibt \`VPC\` unverändert.\n`,
      'utf8'
    );

    const posts = await readPosts(tempDir);
    expect(posts).toHaveLength(1);
    expect(posts[0].html).toMatch(/<abbr[^>]+data-glossary-key="VPC"[^>]*>VPC<\/abbr>/);
    expect(posts[0].html).toMatch(/<abbr[^>]+data-glossary-key="CIDR"[^>]*>CIDR<\/abbr>/);
    expect(posts[0].html).toContain('<code>VPC</code>');
  });

  it('loads topic glossaries and renders representative jargon', async () => {
    await fs.writeFile(
      path.join(tempDir, '2026-08-22-glossary-coverage.md'),
      `---\ntitle: Glossar Coverage\ndate: 2026-08-22\n---\n\nKafka nutzt Events. Ein Embedding-Modell erzeugt Vektoren. Dafür brauche ich noch keinen Vector-Database-Cluster. mTLS schützt den Zugriff. OPML transportiert Feed-Abos.\n`,
      'utf8'
    );

    const posts = await readPosts(tempDir);
    const html = posts[0].html;

    expect(glossaryEntries.length).toBeGreaterThan(150);
    expect(html).toMatch(/<abbr[^>]+data-glossary-key="Kafka"[^>]*>Kafka<\/abbr>/);
    expect(html).toMatch(/<abbr[^>]+data-glossary-key="Embedding-Modell"[^>]*>Embedding-Modell<\/abbr>/);
    expect(html).toMatch(/<abbr[^>]+data-glossary-key="Vector-Database-Cluster"[^>]*>Vector-Database-Cluster<\/abbr>/);
    expect(html).toMatch(/<abbr[^>]+data-glossary-key="mTLS"[^>]*>mTLS<\/abbr>/);
    expect(html).toMatch(/<abbr[^>]+data-glossary-key="OPML"[^>]*>OPML<\/abbr>/);
  });

  it('covers representative terms from the active blog posts', async () => {
    const root = path.join(__dirname, '..');
    const expectedByPost = {
      '2026-08-04-systemd-timer-statt-cron.md': ['Cron', 'Observability', 'Logging'],
      '2026-08-12-cloudflare-tunnel-haerten.md': ['mTLS', 'Rate Limiting', 'Break-Glass-Zugang'],
      '2026-08-18-zero-downtime-mit-compose.md': ['Healthcheck', 'Reverse Proxy', 'Cutover'],
      '2026-08-19-dependabot-im-einsatz.md': ['Dependency Graph', 'Triage', 'Secret Scanning'],
      '2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust.md': ['Cloudflare Zero Trust', 'Docker Volume', 'Public IP'],
      '2026-08-19-fail2ban-ssh-hardening.md': ['SSH', 'Fail2ban', 'UFW'],
      '2026-08-19-markdown-features-im-blog.md': ['Markdown', 'Admonition', 'Frontmatter'],
      '2026-08-19-rss-ist-nicht-tot-freshrss-als-self-hosting-empfehlung.md': ['RSS', 'OPML', 'Self-Hosting'],
      '2026-08-19-systemd-services-sauber-betreiben.md': ['systemd', 'Daemon', 'Runbook'],
      '2026-08-19-wie-dieser-blog-gebaut-ist.md': ['Node.js', 'Docker Compose', 'Audit-Trail'],
      '2026-08-21-docker-vs-docker-compose.md': ['Docker Compose', 'Port-Mapping', 'Cluster-Orchestrator'],
      '2026-08-21-rechtschreib-pipeline-trotz-legasthenie.md': ['CSpell', 'LanguageTool', 'False Positive'],
      '2026-08-22-kernel-grep-semantische-suche-fuer-meinen-blog.md': ['Kafka', 'Embedding-Modell', 'Vector-Database-Cluster', 'Cosine Similarity', 'GraphRAG']
    };

    for (const [filename, expectedKeys] of Object.entries(expectedByPost)) {
      const markdown = await fs.readFile(path.join(root, 'posts', filename), 'utf8');
      const keys = new Set(usedGlossaryLabels(markdown).map(({ entry }) => entry.key));

      for (const key of expectedKeys) {
        expect(keys.has(key), `${filename} should use glossary key ${key}`).toBe(true);
      }
    }
  });

  it('serves the central glossary page', async () => {
    const response = await request(createApp({ postsDir: tempDir })).get('/glossary');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<h1>Glossar</h1>');
    expect(response.text).toContain('id="vpc"');
    expect(response.text).toContain('Virtual Private Cloud');
    expect(response.text).toContain('id="kafka"');
    expect(response.text).toContain('Apache Kafka');
    expect(response.text).toContain('id="embedding-modell"');
    expect(response.text).toContain('id="vector-database-cluster"');
    expect(response.text).toContain('/assets/css/glossary.css');
  });

  it('keeps the tooltip readable independently from the light site text variable', async () => {
    const css = await fs.readFile(
      path.join(__dirname, '..', 'assets', 'css', 'glossary.css'),
      'utf8'
    );

    expect(css).toContain('background: #0b131f;');
    expect(css).toContain('color: #eaf2ff;');
    expect(css).not.toMatch(/\.glossary-tooltip\s*\{[\s\S]*?color:\s*var\(--text/);
  });

  it('syncs only used glossary definitions into markdown and stays idempotent', () => {
    const markdown = `---\ntitle: Test\n---\n\nDie VPC verwendet CIDR. Kafka liefert Events. Ein Embedding-Modell erzeugt Vektoren.\n\n\`AWS\` bleibt Code.\n\n\`\`\`text\nRDS und SSH\n\`\`\`\n`;
    const synced = syncMarkdown(markdown);

    expect(synced).toContain(START_MARKER);
    expect(synced).toContain('*[VPC]: Virtual Private Cloud');
    expect(synced).toContain('*[CIDR]: Classless Inter-Domain Routing');
    expect(synced).toContain('*[Kafka]: Apache Kafka');
    expect(synced).toContain('*[Embedding-Modell]: Embedding Model');
    expect(synced).not.toContain('*[AWS]:');
    expect(synced).not.toContain('*[RDS]:');
    expect(synced).not.toContain('*[SSH]:');
    expect(synced).toContain(END_MARKER);
    expect(syncMarkdown(synced)).toBe(synced);
  });
});
