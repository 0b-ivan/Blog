const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const {
  GitHubGlossaryPublisher: GitHubCatalogPublisher,
  StableTracker,
  parseFrontmatter,
  parsePositiveInteger,
  slugify
} = require('./obsidian-glossary-publisher');

const DEFAULT_VAULT_PATH = '/vault';
const DEFAULT_REPOSITORY = '0b-ivan/Blog';
const DEFAULT_BASE_BRANCH = 'staging';
const DEFAULT_DEBOUNCE_SECONDS = 300;
const DEFAULT_POLL_SECONDS = 30;
const SOURCES_DIR = '_Quellen';
const SOURCE_CATALOG_PATH = 'posts/_sources.json';
const SOURCE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

function sourceFileName(id) {
  const slug = slugify(id);
  if (!slug) {
    throw new Error(`Cannot build source filename for '${id}'`);
  }
  return `${slug}.md`;
}

function branchForSource(id) {
  const slug = slugify(id);
  if (!slug) {
    throw new Error(`Cannot build source branch for '${id}'`);
  }
  return `obsidian-source/${slug}`;
}

function sourceMarkdown({ id, entry, status = 'draft' }) {
  return [
    '---',
    'type: source',
    `id: ${JSON.stringify(id)}`,
    `status: ${status}`,
    `title: ${JSON.stringify(entry.title || '')}`,
    `publisher: ${JSON.stringify(entry.publisher || '')}`,
    `url: ${JSON.stringify(entry.url || '')}`,
    `accessed_at: ${JSON.stringify(entry.accessed_at || '')}`,
    '---',
    '',
    `# ${entry.title || id}`,
    ''
  ].join('\n');
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function sourceEntryFromFrontmatter(frontmatter) {
  const id = String(frontmatter.id || '').trim();
  const title = String(frontmatter.title || '').trim();
  const publisher = String(frontmatter.publisher || '').trim();
  const url = String(frontmatter.url || '').trim();
  const accessedAt = String(frontmatter.accessed_at || '').trim();

  if (!SOURCE_ID_RE.test(id)) {
    throw new Error(`Invalid source id '${id || '<missing>'}'`);
  }
  if (!title) {
    throw new Error(`Source '${id}' requires title`);
  }
  if (!publisher) {
    throw new Error(`Source '${id}' requires publisher`);
  }
  if (!isValidHttpUrl(url)) {
    throw new Error(`Source '${id}' requires a valid HTTP(S) URL`);
  }
  if (accessedAt && !/^\d{4}-\d{2}-\d{2}$/.test(accessedAt)) {
    throw new Error(`Source '${id}' accessed_at must use YYYY-MM-DD`);
  }

  const entry = { title, publisher, url };
  if (accessedAt) {
    entry.accessed_at = accessedAt;
  }
  return { id, entry };
}

class GitHubSourcesPublisher extends GitHubCatalogPublisher {
  async publish({ id, entry }) {
    const branch = branchForSource(id);
    const mainFile = await this.file(SOURCE_CATALOG_PATH, this.baseBranch);
    if (!mainFile) {
      throw new Error(`Source catalog '${SOURCE_CATALOG_PATH}' not found`);
    }

    let data;
    try {
      data = JSON.parse(mainFile.content);
    } catch (error) {
      throw new Error(`Source catalog '${SOURCE_CATALOG_PATH}' is invalid JSON: ${error.message}`, {
        cause: error
      });
    }

    const desired = `${JSON.stringify({ ...data, [id]: entry }, null, 2)}\n`;
    if (mainFile.content === desired) {
      return { action: 'up-to-date', branch, pullRequest: null };
    }

    let pullRequest = await this.openPullRequest(branch);
    await this.ensureBranch(branch, pullRequest);

    const branchFile = await this.file(SOURCE_CATALOG_PATH, branch);
    if (branchFile?.content !== desired) {
      await this.writeFile(SOURCE_CATALOG_PATH, branch, desired, `Update source ${id}`);
    }

    if (!pullRequest) {
      pullRequest = await this.request(`/repos/${this.repository}/pulls`, {
        method: 'POST',
        body: {
          title: `Quelle: ${id}`,
          head: branch,
          base: this.baseBranch,
          body: [
            'Automatisch aus Obsidian erstellt.',
            '',
            `- Quellen-ID: **${id}**`,
            `- Zieldatei: \`${SOURCE_CATALOG_PATH}\``,
            '- Freigabe: `status: publish` in `_Quellen`',
            '- Weitere Änderungen an derselben Quelle aktualisieren denselben PR nach dem Debounce-Fenster.',
            '',
            `Die Quellenänderung wird nach Merge nach \`${this.baseBranch}\` zuerst auf Staging geprüft; Production folgt erst nach verifizierter Promotion nach \`main\`.`
          ].join('\n')
        }
      });
      return { action: 'created-pr', branch, pullRequest };
    }

    return { action: 'updated-pr', branch, pullRequest };
  }
}

async function seedSourcesVault(vaultPath, publisher) {
  const sourcesPath = path.join(vaultPath, SOURCES_DIR);
  await fs.mkdir(sourcesPath, { recursive: true });
  const existing = await fs.readdir(sourcesPath);

  if (existing.some((name) => name.endsWith('.md') && name !== '_Vorlage.md')) {
    console.log(`[sources-publisher] seed skipped: ${SOURCES_DIR} already contains Markdown files`);
    return 0;
  }

  const remote = await publisher.file(SOURCE_CATALOG_PATH, publisher.baseBranch);
  if (!remote) {
    throw new Error(`Source catalog '${SOURCE_CATALOG_PATH}' not found`);
  }

  const data = JSON.parse(remote.content);
  const files = new Map();
  for (const [id, entry] of Object.entries(data)) {
    const fileName = sourceFileName(id);
    if (files.has(fileName)) {
      throw new Error(`Source filename collision for '${id}' -> ${fileName}`);
    }
    files.set(fileName, sourceMarkdown({ id, entry }));
  }

  for (const [fileName, content] of files) {
    await fs.writeFile(path.join(sourcesPath, fileName), content, 'utf8');
  }

  await fs.writeFile(
    path.join(sourcesPath, '_Vorlage.md'),
    sourceMarkdown({
      id: 'new-source',
      entry: {
        title: 'Titel der Quelle',
        publisher: 'Herausgeber',
        url: 'https://example.com',
        accessed_at: ''
      }
    }),
    'utf8'
  );

  console.log(`[sources-publisher] seeded ${files.size} sources into ${sourcesPath}`);
  return files.size;
}

async function sourceFiles(vaultPath) {
  const sourcesPath = path.join(vaultPath, SOURCES_DIR);
  let entries;
  try {
    entries = await fs.readdir(sourcesPath, { withFileTypes: true });
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
    const raw = await fs.readFile(path.join(sourcesPath, entry.name), 'utf8');
    const frontmatter = parseFrontmatter(raw);
    if (String(frontmatter.type || '').trim().toLowerCase() !== 'source') {
      continue;
    }
    result.push({ fileName: entry.name, raw, frontmatter });
  }
  return result;
}

async function runCycle({ vaultPath, tracker, publisher }) {
  const seen = new Set();

  for (const item of await sourceFiles(vaultPath)) {
    const key = item.fileName;
    seen.add(key);
    const status = String(item.frontmatter.status || '').trim().toLowerCase();
    if (status !== 'publish') {
      tracker.forget(key);
      continue;
    }

    const hash = require('node:crypto')
      .createHash('sha256')
      .update(String(item.raw || ''), 'utf8')
      .digest('hex');

    if (!tracker.observe(key, hash)) {
      continue;
    }

    try {
      const { id, entry } = sourceEntryFromFrontmatter(item.frontmatter);
      const result = await publisher.publish({ id, entry });
      tracker.markProcessed(key, hash);

      if (result.action === 'up-to-date') {
        console.log(`[sources-publisher] ${id}: already matches ${publisher.baseBranch}`);
      } else {
        console.log(
          `[sources-publisher] ${id}: ${result.action} ${result.pullRequest?.html_url || result.branch}`
        );
      }
    } catch (error) {
      console.error(`[sources-publisher] ${item.fileName}: ${error.message}`);
    }
  }

  for (const key of tracker.entries.keys()) {
    if (!seen.has(key)) {
      tracker.forget(key);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function main() {
  const token = String(process.env.OBSIDIAN_PUBLISHER_GITHUB_TOKEN || '').trim();
  if (!token) {
    throw new Error('OBSIDIAN_PUBLISHER_GITHUB_TOKEN is required');
  }

  const vaultPath = process.env.PUBLISHER_VAULT_PATH || DEFAULT_VAULT_PATH;
  const repository = process.env.PUBLISHER_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const baseBranch = process.env.PUBLISHER_BASE_BRANCH || DEFAULT_BASE_BRANCH;
  const debounceSeconds = parsePositiveInteger(
    process.env.PUBLISHER_DEBOUNCE_SECONDS,
    DEFAULT_DEBOUNCE_SECONDS
  );
  const pollSeconds = parsePositiveInteger(
    process.env.PUBLISHER_POLL_SECONDS,
    DEFAULT_POLL_SECONDS
  );
  const tracker = new StableTracker(debounceSeconds * 1000);
  const publisher = new GitHubSourcesPublisher({ token, repository, baseBranch });

  console.log(`[sources-publisher] watching ${path.join(vaultPath, SOURCES_DIR)}`);
  console.log(`[sources-publisher] repository ${repository}, base ${baseBranch}`);
  console.log(`[sources-publisher] debounce ${debounceSeconds}s, poll ${pollSeconds}s`);

  try {
    await seedSourcesVault(vaultPath, publisher);
  } catch (error) {
    console.error(`[sources-publisher] seed failed: ${error.message}`);
  }

  while (true) {
    await runCycle({ vaultPath, tracker, publisher });
    await sleep(pollSeconds * 1000);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[sources-publisher] fatal: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  GitHubSourcesPublisher,
  SOURCE_CATALOG_PATH,
  SOURCE_ID_RE,
  SOURCES_DIR,
  branchForSource,
  isValidHttpUrl,
  runCycle,
  seedSourcesVault,
  sourceEntryFromFrontmatter,
  sourceFileName,
  sourceFiles,
  sourceMarkdown
};
