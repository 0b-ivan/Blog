const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_VAULT_PATH = '/vault';
const DEFAULT_REPOSITORY = '0b-ivan/Blog';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_DEBOUNCE_SECONDS = 300;
const DEFAULT_POLL_SECONDS = 30;
const GLOSSARY_DIR = '_Glossar';
const GLOSSARY_SECTIONS = new Set([
  'base',
  'extended',
  'git-ci',
  'platform',
  'reader',
  'search',
  'security',
  'writing'
]);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSource(raw) {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '');
}

function parseScalar(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('[') && text.endsWith(']')) ||
    (text.startsWith('{') && text.endsWith('}'))
  ) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      // Continue with the simple string parser.
    }
  }

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }

  return text;
}

function parseFrontmatter(raw) {
  const normalized = normalizeSource(raw);
  if (!normalized.startsWith('---\n')) {
    return {};
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return {};
  }

  const data = {};
  for (const line of normalized.slice(4, closing).split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (match) {
      data[match[1]] = parseScalar(match[2]);
    }
  }
  return data;
}

function markdownBody(raw) {
  const normalized = normalizeSource(raw);
  if (!normalized.startsWith('---\n')) {
    return normalized.trim();
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return normalized.trim();
  }

  return normalized.slice(closing + 5).trim();
}

function parseAliases(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  const text = String(value || '').trim();
  if (!text) {
    return [];
  }
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function contentHash(raw) {
  return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function branchForGlossary(term) {
  const slug = slugify(term);
  if (!slug) {
    throw new Error(`Cannot build glossary branch for '${term}'`);
  }
  return `obsidian-glossary/${slug}`;
}

function glossaryFileName(term) {
  const slug = slugify(term);
  if (!slug) {
    throw new Error(`Cannot build glossary filename for '${term}'`);
  }
  return `${slug}.md`;
}

function glossaryConfigPath(section) {
  const normalized = String(section || 'base').trim().toLowerCase();
  if (!GLOSSARY_SECTIONS.has(normalized)) {
    throw new Error(`Unknown glossary section '${section}'`);
  }
  return normalized === 'base' ? 'config/glossary.json' : `config/glossary/${normalized}.json`;
}

function glossaryMarkdown({ term, section, entry, status = 'draft' }) {
  return [
    '---',
    'type: glossary',
    `term: ${JSON.stringify(term)}`,
    `section: ${section}`,
    `status: ${status}`,
    `full: ${JSON.stringify(entry.full || term)}`,
    `short: ${JSON.stringify(entry.short || '')}`,
    `aliases: ${JSON.stringify(Array.isArray(entry.aliases) ? entry.aliases : [])}`,
    '---',
    '',
    `# ${term}`,
    '',
    String(entry.description || '').trim(),
    ''
  ].join('\n');
}

function glossaryDescription(raw, term) {
  let body = markdownBody(raw);
  const lines = body.split('\n');
  if (lines[0]?.trim() === `# ${term}`) {
    body = lines.slice(1).join('\n').trim();
  }
  return body;
}

function encodePath(value) {
  return String(value || '').split('/').map((part) => encodeURIComponent(part)).join('/');
}

class StableTracker {
  constructor(debounceMs) {
    this.debounceMs = debounceMs;
    this.entries = new Map();
  }

  observe(key, hash, now = Date.now()) {
    const previous = this.entries.get(key);
    if (!previous || previous.hash !== hash) {
      this.entries.set(key, { hash, since: now, processed: false });
      return false;
    }
    if (previous.processed) {
      return false;
    }
    return now - previous.since >= this.debounceMs;
  }

  markProcessed(key, hash) {
    const current = this.entries.get(key);
    if (current && current.hash === hash) {
      current.processed = true;
    }
  }

  forget(key) {
    this.entries.delete(key);
  }
}

class GitHubGlossaryPublisher {
  constructor({ token, repository, baseBranch }) {
    this.token = token;
    this.repository = repository;
    this.baseBranch = baseBranch;
    this.owner = repository.split('/')[0];
  }

  async request(endpoint, { method = 'GET', body = null, allow404 = false } = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kernel-notes-obsidian-glossary-publisher'
      },
      body: body === null ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        payload = text;
      }
    }

    if (allow404 && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' ? payload.message : payload;
      throw new Error(`GitHub API ${method} ${endpoint} failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    }
    return payload;
  }

  async branchSha(branch) {
    const ref = await this.request(`/repos/${this.repository}/git/ref/heads/${encodePath(branch)}`, { allow404: true });
    return ref?.object?.sha || null;
  }

  async file(filePath, ref) {
    const result = await this.request(
      `/repos/${this.repository}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(ref)}`,
      { allow404: true }
    );
    if (!result || Array.isArray(result) || result.type !== 'file') {
      return null;
    }
    return {
      sha: result.sha,
      content: Buffer.from(String(result.content || '').replace(/\n/g, ''), 'base64').toString('utf8')
    };
  }

  async directory(directoryPath, ref) {
    const result = await this.request(
      `/repos/${this.repository}/contents/${encodePath(directoryPath)}?ref=${encodeURIComponent(ref)}`,
      { allow404: true }
    );
    return Array.isArray(result) ? result : [];
  }

  async openPullRequest(branch) {
    const head = encodeURIComponent(`${this.owner}:${branch}`);
    const base = encodeURIComponent(this.baseBranch);
    const pulls = await this.request(`/repos/${this.repository}/pulls?state=open&head=${head}&base=${base}&per_page=10`);
    return Array.isArray(pulls) && pulls.length > 0 ? pulls[0] : null;
  }

  async ensureBranch(branch, pullRequest) {
    const baseSha = await this.branchSha(this.baseBranch);
    if (!baseSha) {
      throw new Error(`Base branch '${this.baseBranch}' not found`);
    }

    const branchSha = await this.branchSha(branch);
    if (!pullRequest) {
      if (!branchSha) {
        await this.request(`/repos/${this.repository}/git/refs`, {
          method: 'POST',
          body: { ref: `refs/heads/${branch}`, sha: baseSha }
        });
      } else if (branchSha !== baseSha) {
        await this.request(`/repos/${this.repository}/git/refs/heads/${encodePath(branch)}`, {
          method: 'PATCH',
          body: { sha: baseSha, force: true }
        });
      }
    }
  }

  async writeFile(filePath, branch, raw, message) {
    const current = await this.file(filePath, branch);
    const body = {
      message,
      content: Buffer.from(raw, 'utf8').toString('base64'),
      branch
    };
    if (current?.sha) {
      body.sha = current.sha;
    }
    await this.request(`/repos/${this.repository}/contents/${encodePath(filePath)}`, {
      method: 'PUT',
      body
    });
  }

  async publish({ term, section, entry }) {
    const filePath = glossaryConfigPath(section);
    const branch = branchForGlossary(term);
    const mainFile = await this.file(filePath, this.baseBranch);
    if (!mainFile) {
      throw new Error(`Glossary config '${filePath}' not found`);
    }

    let data;
    try {
      data = JSON.parse(mainFile.content);
    } catch (error) {
      throw new Error(`Glossary config '${filePath}' is invalid JSON: ${error.message}`);
    }

    const desired = `${JSON.stringify({ ...data, [term]: entry }, null, 2)}\n`;
    if (mainFile.content === desired) {
      return { action: 'up-to-date', branch, pullRequest: null };
    }

    let pullRequest = await this.openPullRequest(branch);
    await this.ensureBranch(branch, pullRequest);

    const branchFile = await this.file(filePath, branch);
    if (branchFile?.content !== desired) {
      await this.writeFile(filePath, branch, desired, `Update glossary term ${term}`);
    }

    if (!pullRequest) {
      pullRequest = await this.request(`/repos/${this.repository}/pulls`, {
        method: 'POST',
        body: {
          title: `Glossar: ${term}`,
          head: branch,
          base: this.baseBranch,
          body: [
            'Automatisch aus Obsidian erstellt.',
            '',
            `- Begriff: **${term}**`,
            `- Zieldatei: \`${filePath}\``,
            '- Freigabe: `status: publish` in `_Glossar`',
            '- Weitere Änderungen am Begriff aktualisieren denselben PR nach dem Debounce-Fenster.',
            '',
            'Die Glossar-Änderung wird erst nach Merge nach `main` übernommen.'
          ].join('\n')
        }
      });
      return { action: 'created-pr', branch, pullRequest };
    }

    return { action: 'updated-pr', branch, pullRequest };
  }

  async glossarySources() {
    const sources = [{ section: 'base', path: 'config/glossary.json' }];
    const entries = await this.directory('config/glossary', this.baseBranch);
    for (const entry of entries) {
      if (entry.type !== 'file' || !entry.name.endsWith('.json')) {
        continue;
      }
      const section = entry.name.replace(/\.json$/i, '');
      if (GLOSSARY_SECTIONS.has(section)) {
        sources.push({ section, path: `config/glossary/${entry.name}` });
      }
    }
    return sources;
  }
}

async function seedGlossaryVault(vaultPath, publisher) {
  const glossaryPath = path.join(vaultPath, GLOSSARY_DIR);
  await fs.mkdir(glossaryPath, { recursive: true });
  const existing = await fs.readdir(glossaryPath);

  if (existing.some((name) => name.endsWith('.md') && name !== '_Vorlage.md')) {
    console.log(`[glossary-publisher] seed skipped: ${GLOSSARY_DIR} already contains Markdown files`);
    return 0;
  }

  const files = new Map();
  for (const source of await publisher.glossarySources()) {
    const remote = await publisher.file(source.path, publisher.baseBranch);
    if (!remote) {
      continue;
    }
    const data = JSON.parse(remote.content);
    for (const [term, entry] of Object.entries(data)) {
      const fileName = glossaryFileName(term);
      if (files.has(fileName)) {
        throw new Error(`Glossary filename collision for '${term}' -> ${fileName}`);
      }
      files.set(fileName, glossaryMarkdown({ term, section: source.section, entry }));
    }
  }

  for (const [fileName, content] of files) {
    await fs.writeFile(path.join(glossaryPath, fileName), content, 'utf8');
  }

  await fs.writeFile(
    path.join(glossaryPath, '_Vorlage.md'),
    glossaryMarkdown({
      term: 'Neuer Begriff',
      section: 'platform',
      entry: {
        full: 'Ausgeschriebener Begriff',
        short: 'Kurze Erklärung für den Tooltip.',
        description: 'Ausführlichere Erklärung für die Glossar-Seite.',
        aliases: []
      }
    }),
    'utf8'
  );

  console.log(`[glossary-publisher] seeded ${files.size} glossary terms into ${glossaryPath}`);
  return files.size;
}

async function glossaryFiles(vaultPath) {
  const glossaryPath = path.join(vaultPath, GLOSSARY_DIR);
  let entries;
  try {
    entries = await fs.readdir(glossaryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const result = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === '_Vorlage.md') {
      continue;
    }
    const raw = await fs.readFile(path.join(glossaryPath, entry.name), 'utf8');
    const frontmatter = parseFrontmatter(raw);
    if (String(frontmatter.type || '').trim().toLowerCase() !== 'glossary') {
      continue;
    }
    result.push({ fileName: entry.name, raw, frontmatter });
  }
  return result;
}

async function runCycle({ vaultPath, tracker, publisher }) {
  const seen = new Set();

  for (const item of await glossaryFiles(vaultPath)) {
    const key = item.fileName;
    seen.add(key);
    const status = String(item.frontmatter.status || '').trim().toLowerCase();
    if (status !== 'publish') {
      tracker.forget(key);
      continue;
    }

    const hash = contentHash(item.raw);
    if (!tracker.observe(key, hash)) {
      continue;
    }

    try {
      const term = String(item.frontmatter.term || '').trim();
      const section = String(item.frontmatter.section || 'base').trim().toLowerCase();
      const full = String(item.frontmatter.full || term).trim();
      const short = String(item.frontmatter.short || '').trim();
      const aliases = parseAliases(item.frontmatter.aliases);
      const description = glossaryDescription(item.raw, term);

      if (!term) {
        throw new Error('Frontmatter field term is required');
      }
      if (!short) {
        throw new Error(`Glossary term '${term}' requires short`);
      }
      if (!description) {
        throw new Error(`Glossary term '${term}' requires a description`);
      }

      const result = await publisher.publish({
        term,
        section,
        entry: { full, short, description, aliases }
      });
      tracker.markProcessed(key, hash);

      if (result.action === 'up-to-date') {
        console.log(`[glossary-publisher] ${term}: already matches ${publisher.baseBranch}`);
      } else {
        console.log(`[glossary-publisher] ${term}: ${result.action} ${result.pullRequest?.html_url || result.branch}`);
      }
    } catch (error) {
      console.error(`[glossary-publisher] ${item.fileName}: ${error.message}`);
    }
  }

  for (const key of tracker.entries.keys()) {
    if (!seen.has(key)) {
      tracker.forget(key);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const token = String(process.env.OBSIDIAN_PUBLISHER_GITHUB_TOKEN || '').trim();
  if (!token) {
    throw new Error('OBSIDIAN_PUBLISHER_GITHUB_TOKEN is required');
  }

  const vaultPath = process.env.PUBLISHER_VAULT_PATH || DEFAULT_VAULT_PATH;
  const repository = process.env.PUBLISHER_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const baseBranch = process.env.PUBLISHER_BASE_BRANCH || DEFAULT_BASE_BRANCH;
  const debounceSeconds = parsePositiveInteger(process.env.PUBLISHER_DEBOUNCE_SECONDS, DEFAULT_DEBOUNCE_SECONDS);
  const pollSeconds = parsePositiveInteger(process.env.PUBLISHER_POLL_SECONDS, DEFAULT_POLL_SECONDS);
  const tracker = new StableTracker(debounceSeconds * 1000);
  const publisher = new GitHubGlossaryPublisher({ token, repository, baseBranch });

  console.log(`[glossary-publisher] watching ${path.join(vaultPath, GLOSSARY_DIR)}`);
  console.log(`[glossary-publisher] repository ${repository}, base ${baseBranch}`);
  console.log(`[glossary-publisher] debounce ${debounceSeconds}s, poll ${pollSeconds}s`);

  try {
    await seedGlossaryVault(vaultPath, publisher);
  } catch (error) {
    console.error(`[glossary-publisher] seed failed: ${error.message}`);
  }

  while (true) {
    await runCycle({ vaultPath, tracker, publisher });
    await sleep(pollSeconds * 1000);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[glossary-publisher] fatal: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  GLOSSARY_SECTIONS,
  GitHubGlossaryPublisher,
  StableTracker,
  branchForGlossary,
  glossaryConfigPath,
  glossaryDescription,
  glossaryFileName,
  glossaryMarkdown,
  markdownBody,
  parseAliases,
  parseFrontmatter,
  parsePositiveInteger,
  runCycle,
  seedGlossaryVault,
  slugify
};
