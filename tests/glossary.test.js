const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
  createApp,
  readPosts
} = require('../server');
const {
  END_MARKER,
  START_MARKER,
  syncMarkdown
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

  it('serves the central glossary page', async () => {
    const response = await request(createApp({ postsDir: tempDir })).get('/glossary');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<h1>Glossar</h1>');
    expect(response.text).toContain('id="vpc"');
    expect(response.text).toContain('Virtual Private Cloud');
    expect(response.text).toContain('/assets/css/glossary.css');
  });

  it('syncs only used glossary definitions into markdown and stays idempotent', () => {
    const markdown = `---\ntitle: Test\n---\n\nDie VPC verwendet CIDR.\n\n\`AWS\` bleibt Code.\n\n\`\`\`text\nRDS und SSH\n\`\`\`\n`;
    const synced = syncMarkdown(markdown);

    expect(synced).toContain(START_MARKER);
    expect(synced).toContain('*[VPC]: Virtual Private Cloud');
    expect(synced).toContain('*[CIDR]: Classless Inter-Domain Routing');
    expect(synced).not.toContain('*[AWS]:');
    expect(synced).not.toContain('*[RDS]:');
    expect(synced).not.toContain('*[SSH]:');
    expect(synced).toContain(END_MARKER);
    expect(syncMarkdown(synced)).toBe(synced);
  });
});
