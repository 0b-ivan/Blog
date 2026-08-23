const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_VAULT_PATH = '/vault';
const DEFAULT_REPOSITORY = '0b-ivan/Blog';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_DEBOUNCE_SECONDS = 300;
const DEFAULT_POLL_SECONDS = 30;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripYamlQuotes(value) {
  const text = String(value || '').trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1);
    }
  }
  return text;
}

function parseFrontmatter(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {};
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return {};
  }

  const data = {};
  const lines = normalized.slice(4, closing).split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    data[match[1]] = stripYamlQuotes(match[2]);
  }
  return data;
}

function contentHash(raw) {
  return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function branchForFile(fileName) {
  const slug = String(fileName || '')
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) {
    throw new Error(`Cannot build publisher branch for '${fileName}'`);
  }

  return `obsidian/${slug}`;
}

function encodePath(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
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

class GitHubPublisher {
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
        'User-Agent': 'kernel-notes-obsidian-publisher'
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
    const ref = await this.request(
      `/repos/${this.repository}/git/ref/heads/${encodePath(branch)}`,
      { allow404: true }
    );
    return ref?.object?.sha || null;
  }

  async createBranch(branch, sha) {
    await this.request(`/repos/${this.repository}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha }
    });
  }

  async resetBranch(branch, sha) {
    await this.request(`/repos/${this.repository}/git/refs/heads/${encodePath(branch)}`, {
      method: 'PATCH',
      body: { sha, force: true }
    });
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

  async openPullRequest(branch) {
    const head = encodeURIComponent(`${this.owner}:${branch}`);
    const base = encodeURIComponent(this.baseBranch);
    const pulls = await this.request(
      `/repos/${this.repository}/pulls?state=open&head=${head}&base=${base}&per_page=10`
    );
    return Array.isArray(pulls) && pulls.length > 0 ? pulls[0] : null;
  }

  async writeFile(filePath, branch, raw, title) {
    const current = await this.file(filePath, branch);
    const body = {
      message: `Publish ${title}`,
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

  async createPullRequest(branch, title, filePath) {
    return this.request(`/repos/${this.repository}/pulls`, {
      method: 'POST',
      body: {
        title: `Publish: ${title}`,
        head: branch,
        base: this.baseBranch,
        body: [
          'Automatisch aus Obsidian erstellt.',
          '',
          `- Artikel: \`${filePath}\``,
          '- Freigabe: `status: publish`',
          '- Weitere Aenderungen in Obsidian aktualisieren diesen PR nach dem Debounce-Fenster.',
          '',
          'Der Artikel wird erst nach Merge nach `main` veroeffentlicht.'
        ].join('\n')
      }
    });
  }

  async publish({ fileName, raw, title }) {
    const filePath = `posts/${fileName}`;
    const branch = branchForFile(fileName);
    const mainFile = await this.file(filePath, this.baseBranch);

    if (mainFile?.content === raw) {
      return { action: 'up-to-date', branch, pullRequest: null };
    }

    let pullRequest = await this.openPullRequest(branch);
    const baseSha = await this.branchSha(this.baseBranch);
    if (!baseSha) {
      throw new Error(`Base branch '${this.baseBranch}' not found`);
    }

    const branchSha = await this.branchSha(branch);
    if (!pullRequest) {
      if (!branchSha) {
        await this.createBranch(branch, baseSha);
      } else if (branchSha !== baseSha) {
        await this.resetBranch(branch, baseSha);
      }
    } else if (!branchSha) {
      await this.createBranch(branch, baseSha);
    }

    const branchFile = await this.file(filePath, branch);
    if (branchFile?.content !== raw) {
      await this.writeFile(filePath, branch, raw, title);
    }

    if (!pullRequest) {
      pullRequest = await this.createPullRequest(branch, title, filePath);
      return { action: 'created-pr', branch, pullRequest };
    }

    return { action: 'updated-pr', branch, pullRequest };
  }
}

async function markdownArticles(vaultPath) {
  let entries;
  try {
    entries = await fs.readdir(vaultPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const articles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const fullPath = path.join(vaultPath, entry.name);
    const raw = await fs.readFile(fullPath, 'utf8');
    const frontmatter = parseFrontmatter(raw);
    articles.push({ fileName: entry.name, raw, frontmatter });
  }
  return articles;
}

async function runCycle({ vaultPath, tracker, publisher }) {
  const articles = await markdownArticles(vaultPath);
  const seen = new Set();

  for (const article of articles) {
    const status = String(article.frontmatter.status || '').trim().toLowerCase();
    seen.add(article.fileName);

    if (status !== 'publish') {
      tracker.forget(article.fileName);
      continue;
    }

    const hash = contentHash(article.raw);
    if (!tracker.observe(article.fileName, hash)) {
      continue;
    }

    const title = String(article.frontmatter.title || article.fileName.replace(/\.md$/i, '')).trim();
    try {
      const result = await publisher.publish({
        fileName: article.fileName,
        raw: article.raw,
        title
      });
      tracker.markProcessed(article.fileName, hash);

      if (result.action === 'up-to-date') {
        console.log(`[publisher] ${article.fileName}: already matches ${publisher.baseBranch}`);
      } else {
        console.log(`[publisher] ${article.fileName}: ${result.action} ${result.pullRequest?.html_url || result.branch}`);
      }
    } catch (error) {
      console.error(`[publisher] ${article.fileName}: ${error.message}`);
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
  const debounceSeconds = parsePositiveInteger(
    process.env.PUBLISHER_DEBOUNCE_SECONDS,
    DEFAULT_DEBOUNCE_SECONDS
  );
  const pollSeconds = parsePositiveInteger(process.env.PUBLISHER_POLL_SECONDS, DEFAULT_POLL_SECONDS);

  const tracker = new StableTracker(debounceSeconds * 1000);
  const publisher = new GitHubPublisher({ token, repository, baseBranch });

  console.log(`[publisher] watching ${vaultPath}`);
  console.log(`[publisher] repository ${repository}, base ${baseBranch}`);
  console.log(`[publisher] debounce ${debounceSeconds}s, poll ${pollSeconds}s`);

  while (true) {
    await runCycle({ vaultPath, tracker, publisher });
    await sleep(pollSeconds * 1000);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[publisher] fatal: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  GitHubPublisher,
  StableTracker,
  branchForFile,
  contentHash,
  parseFrontmatter,
  parsePositiveInteger,
  runCycle,
  stripYamlQuotes
};
