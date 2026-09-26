const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_VAULT_PATH = '/vault';
const DEFAULT_REPOSITORY = '0b-ivan/Blog';
const DEFAULT_BASE_BRANCH = 'staging';
const DEFAULT_PRODUCTION_BRANCH = 'main';
const DEFAULT_PROMOTION_BRANCH = 'promotion/staging-verified';
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

function frontmatterLines(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return [];
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return [];
  }

  return normalized.slice(4, closing).split('\n');
}

function parseFrontmatter(raw) {
  const lines = frontmatterLines(raw);
  if (lines.length === 0) {
    return {};
  }

  const data = {};
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

function slugForFile(fileName) {
  const slug = String(fileName || '')
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) {
    throw new Error(`Cannot build publisher branch for '${fileName}'`);
  }

  return slug;
}

function branchForFile(fileName) {
  return `obsidian/${slugForFile(fileName)}`;
}

function productionUnpublishBranchForFile(fileName) {
  return `obsidian-unpublish/main/${slugForFile(fileName)}`;
}

function encodePath(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function modeTitle(mode, title) {
  if (mode === 'unpublish') {
    return `Unpublish: ${title}`;
  }
  if (mode === 'archive') {
    return `Archive: ${title}`;
  }
  return `Publish: ${title}`;
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
  constructor({ token, repository, baseBranch, productionBranch = DEFAULT_PRODUCTION_BRANCH, promotionBranch = DEFAULT_PROMOTION_BRANCH }) {
    this.token = token;
    this.repository = repository;
    this.baseBranch = baseBranch;
    this.productionBranch = productionBranch;
    this.promotionBranch = promotionBranch;
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

  async openPullRequest(branch, baseBranch = this.baseBranch) {
    const head = encodeURIComponent(`${this.owner}:${branch}`);
    const base = encodeURIComponent(baseBranch);
    const pulls = await this.request(
      `/repos/${this.repository}/pulls?state=open&head=${head}&base=${base}&per_page=10`
    );
    return Array.isArray(pulls) && pulls.length > 0 ? pulls[0] : null;
  }

  async writeFile(filePath, branch, raw, title, mode = 'publish') {
    const current = await this.file(filePath, branch);
    const verb = mode === 'archive' ? 'Archive' : 'Publish';
    const body = {
      message: `${verb} ${title}`,
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

  async deleteFile(filePath, branch, title, mode = 'unpublish') {
    const current = await this.file(filePath, branch);
    if (!current?.sha) {
      return false;
    }

    const verb = mode === 'archive' ? 'Archive' : mode === 'publish' ? 'Restore' : 'Unpublish';
    await this.request(`/repos/${this.repository}/contents/${encodePath(filePath)}`, {
      method: 'DELETE',
      body: {
        message: `${verb} ${title}`,
        sha: current.sha,
        branch
      }
    });
    return true;
  }

  pullRequestBody(mode, title, filePath, baseBranch = this.baseBranch) {
    if (mode === 'unpublish') {
      return [
        'Automatisch aus Obsidian erstellt.',
        '',
        `- Artikel: \`${filePath}\``,
        '- Status: `draft`',
        `- Zielbranch: \`${baseBranch}\``,
        '- Der Artikel wird aus `posts/` und `archive/` entfernt und dadurch vollstaendig privat.',
        '- Unpublish ist ein Fast-Track: dieser PR darf nach erfolgreichen Required Checks automatisch gemergt werden.',
        '- Die Datei bleibt im Obsidian-Vault erhalten und kann spaeter erneut auf `publish` oder `archived` gesetzt werden.',
        '',
        baseBranch === this.productionBranch
          ? 'Production wird bewusst direkt entfernt; ein spaeteres Publish laeuft wieder ueber staging und den manuellen Promotion-Merge.'
          : 'Staging wird parallel entfernt, damit der Artikel dort ebenfalls nicht mehr sichtbar ist.'
      ].join('\n');
    }

    if (mode === 'archive') {
      return [
        'Automatisch aus Obsidian erstellt.',
        '',
        `- Artikel: \`${filePath}\``,
        '- Status: `archived`',
        '- Der Artikel wird aus `posts/` nach `archive/` verschoben.',
        '- Er verschwindet aus der normalen Artikelliste, bleibt aber unter `/archive` lesbar.',
        '- Die Datei bleibt im Obsidian-Vault erhalten und kann spaeter wieder auf `publish` gesetzt werden.',
        '',
        'Der Artikel wird erst nach Merge dieses PR archiviert.'
      ].join('\n');
    }

    return [
      'Automatisch aus Obsidian erstellt.',
      '',
      `- Artikel: \`${filePath}\``,
      '- Freigabe: `status: publish`',
      '- Falls der Artikel archiviert ist, wird er aus `archive/` wieder nach `posts/` geholt.',
      '- Semantic-Search-Regression wird direkt aus `search_queries` im Artikel-Frontmatter gelesen.',
      '- Jeder veröffentlichte Artikel braucht mindestens eine Regression-Frage; die CI prüft das.',
      '- Weitere Aenderungen in Obsidian aktualisieren diesen PR nach dem Debounce-Fenster.',
      '',
      `Der Artikel wird erst nach Merge nach \`${this.baseBranch}\` in den konfigurierten Basisbranch übernommen.`
    ].join('\n');
  }

  async createPullRequest(branch, title, filePath, mode = 'publish', baseBranch = this.baseBranch) {
    return this.request(`/repos/${this.repository}/pulls`, {
      method: 'POST',
      body: {
        title: modeTitle(mode, title),
        head: branch,
        base: baseBranch,
        body: this.pullRequestBody(mode, title, filePath, baseBranch)
      }
    });
  }

  async updatePullRequest(pullRequest, title, filePath, mode, baseBranch = this.baseBranch) {
    return this.request(`/repos/${this.repository}/pulls/${pullRequest.number}`, {
      method: 'PATCH',
      body: {
        title: modeTitle(mode, title),
        body: this.pullRequestBody(mode, title, filePath, baseBranch)
      }
    });
  }

  async closePullRequest(pullRequest) {
    await this.request(`/repos/${this.repository}/pulls/${pullRequest.number}`, {
      method: 'PATCH',
      body: { state: 'closed' }
    });
  }

  async ensureBranch(branch, pullRequest, baseBranch = this.baseBranch) {
    const baseSha = await this.branchSha(baseBranch);
    if (!baseSha) {
      throw new Error(`Base branch '${baseBranch}' not found`);
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
  }

  async closeOpenPromotionPullRequest() {
    const pullRequest = await this.openPullRequest(this.promotionBranch, this.productionBranch);
    if (!pullRequest) {
      return null;
    }

    await this.closePullRequest(pullRequest);
    return pullRequest;
  }

  async ensureUnpublishPullRequest({ filePath, archivePath, title, baseBranch, branch }) {
    const activeFile = await this.file(filePath, baseBranch);
    const archivedFile = await this.file(archivePath, baseBranch);
    let pullRequest = await this.openPullRequest(branch, baseBranch);

    if (!activeFile && !archivedFile) {
      if (pullRequest) {
        await this.closePullRequest(pullRequest);
      }
      return { action: 'already-offline', branch, pullRequest: null };
    }

    await this.ensureBranch(branch, pullRequest, baseBranch);
    await this.deleteFile(filePath, branch, title, 'unpublish');
    await this.deleteFile(archivePath, branch, title, 'unpublish');

    if (!pullRequest) {
      pullRequest = await this.createPullRequest(branch, title, filePath, 'unpublish', baseBranch);
      return { action: 'created-unpublish-pr', branch, pullRequest };
    }

    pullRequest = await this.updatePullRequest(pullRequest, title, filePath, 'unpublish', baseBranch);
    return { action: 'updated-unpublish-pr', branch, pullRequest };
  }

  async publish({ fileName, raw, title }) {
    const filePath = `posts/${fileName}`;
    const archivePath = `archive/${fileName}`;
    const branch = branchForFile(fileName);
    const mainFile = await this.file(filePath, this.baseBranch);
    const mainArchiveFile = await this.file(archivePath, this.baseBranch);
    let pullRequest = await this.openPullRequest(branch);

    if (mainFile?.content === raw && !mainArchiveFile) {
      if (pullRequest) {
        await this.closePullRequest(pullRequest);
        return { action: 'closed-stale-pr', branch, pullRequest };
      }
      return { action: 'up-to-date', branch, pullRequest: null };
    }

    await this.ensureBranch(branch, pullRequest);

    const branchFile = await this.file(filePath, branch);
    if (branchFile?.content !== raw) {
      await this.writeFile(filePath, branch, raw, title, 'publish');
    }
    await this.deleteFile(archivePath, branch, title, 'publish');

    if (!pullRequest) {
      pullRequest = await this.createPullRequest(branch, title, filePath, 'publish');
      return { action: 'created-pr', branch, pullRequest };
    }

    pullRequest = await this.updatePullRequest(pullRequest, title, filePath, 'publish');
    return { action: 'updated-pr', branch, pullRequest };
  }

  async unpublish({ fileName, title }) {
    const filePath = `posts/${fileName}`;
    const archivePath = `archive/${fileName}`;
    const stagingBranch = branchForFile(fileName);
    const productionBranch = productionUnpublishBranchForFile(fileName);

    const stagingFile = await this.file(filePath, this.baseBranch);
    const stagingArchiveFile = await this.file(archivePath, this.baseBranch);
    const productionFile = this.productionBranch === this.baseBranch
      ? stagingFile
      : await this.file(filePath, this.productionBranch);
    const productionArchiveFile = this.productionBranch === this.baseBranch
      ? stagingArchiveFile
      : await this.file(archivePath, this.productionBranch);

    if (!stagingFile && !stagingArchiveFile && !productionFile && !productionArchiveFile) {
      const pendingPublish = await this.openPullRequest(stagingBranch, this.baseBranch);
      if (pendingPublish) {
        await this.closePullRequest(pendingPublish);
        return { action: 'closed-pending-publish', branch: stagingBranch, pullRequest: pendingPublish };
      }
      return { action: 'already-offline', branch: stagingBranch, pullRequest: null };
    }

    if (productionFile || productionArchiveFile) {
      await this.closeOpenPromotionPullRequest();
    }

    const staging = await this.ensureUnpublishPullRequest({
      fileName,
      filePath,
      archivePath,
      title,
      baseBranch: this.baseBranch,
      branch: stagingBranch
    });

    let production = staging;
    if (this.productionBranch !== this.baseBranch) {
      production = await this.ensureUnpublishPullRequest({
        fileName,
        filePath,
        archivePath,
        title,
        baseBranch: this.productionBranch,
        branch: productionBranch
      });
    }

    return {
      action: 'fast-track-unpublish',
      branch: staging.branch,
      pullRequest: staging.pullRequest,
      staging,
      production
    };
  }

  async archive({ fileName, raw, title }) {
    const filePath = `posts/${fileName}`;
    const archivePath = `archive/${fileName}`;
    const branch = branchForFile(fileName);
    const mainFile = await this.file(filePath, this.baseBranch);
    const mainArchiveFile = await this.file(archivePath, this.baseBranch);
    let pullRequest = await this.openPullRequest(branch);

    if (!mainFile && mainArchiveFile?.content === raw) {
      if (pullRequest) {
        await this.closePullRequest(pullRequest);
        return { action: 'closed-stale-pr', branch, pullRequest };
      }
      return { action: 'already-archived', branch, pullRequest: null };
    }

    await this.ensureBranch(branch, pullRequest);

    const branchArchiveFile = await this.file(archivePath, branch);
    if (branchArchiveFile?.content !== raw) {
      await this.writeFile(archivePath, branch, raw, title, 'archive');
    }
    await this.deleteFile(filePath, branch, title, 'archive');

    if (!pullRequest) {
      pullRequest = await this.createPullRequest(branch, title, filePath, 'archive');
      return { action: 'created-archive-pr', branch, pullRequest };
    }

    pullRequest = await this.updatePullRequest(pullRequest, title, filePath, 'archive');
    return { action: 'updated-archive-pr', branch, pullRequest };
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

    if (!['publish', 'draft', 'archived'].includes(status)) {
      tracker.forget(article.fileName);
      continue;
    }

    const hash = contentHash(article.raw);
    if (!tracker.observe(article.fileName, hash)) {
      continue;
    }

    const title = String(article.frontmatter.title || article.fileName.replace(/\.md$/i, '')).trim();
    try {
      let result;
      if (status === 'publish') {
        result = await publisher.publish({
          fileName: article.fileName,
          raw: article.raw,
          title
        });
      } else if (status === 'archived') {
        result = await publisher.archive({
          fileName: article.fileName,
          raw: article.raw,
          title
        });
      } else {
        result = await publisher.unpublish({
          fileName: article.fileName,
          title
        });
      }

      tracker.markProcessed(article.fileName, hash);

      if (result.action === 'up-to-date') {
        console.log(`[publisher] ${article.fileName}: already matches ${publisher.baseBranch}`);
      } else if (result.action === 'already-offline') {
        console.log(`[publisher] ${article.fileName}: draft and already offline`);
      } else if (result.action === 'already-archived') {
        console.log(`[publisher] ${article.fileName}: already archived`);
      } else if (result.action === 'closed-pending-publish') {
        console.log(`[publisher] ${article.fileName}: draft closed pending publish PR`);
      } else if (result.action === 'closed-stale-pr') {
        console.log(`[publisher] ${article.fileName}: desired state already matches ${publisher.baseBranch}; closed stale PR`);
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
  const productionBranch = process.env.PUBLISHER_PRODUCTION_BRANCH || DEFAULT_PRODUCTION_BRANCH;
  const promotionBranch = process.env.PUBLISHER_PROMOTION_BRANCH || DEFAULT_PROMOTION_BRANCH;
  const debounceSeconds = parsePositiveInteger(
    process.env.PUBLISHER_DEBOUNCE_SECONDS,
    DEFAULT_DEBOUNCE_SECONDS
  );
  const pollSeconds = parsePositiveInteger(process.env.PUBLISHER_POLL_SECONDS, DEFAULT_POLL_SECONDS);

  const tracker = new StableTracker(debounceSeconds * 1000);
  const publisher = new GitHubPublisher({ token, repository, baseBranch, productionBranch, promotionBranch });

  console.log(`[publisher] watching ${vaultPath}`);
  console.log(`[publisher] repository ${repository}, staging ${baseBranch}, production ${productionBranch}`);
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
  productionUnpublishBranchForFile,
  contentHash,
  frontmatterLines,
  modeTitle,
  parseFrontmatter,
  parsePositiveInteger,
  runCycle,
  stripYamlQuotes
};
