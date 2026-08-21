const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const postsDir = path.join(root, 'posts');
const archiveDir = path.join(root, 'archive');
const historyDir = path.join(root, 'post-history');

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024
  });
}

function tryGitText(commit, candidates) {
  for (const candidate of candidates) {
    try {
      return {
        path: candidate,
        content: runGit(['show', `${commit}:${candidate}`])
      };
    } catch (_error) {
      // Try the next historical location. Posts can move between posts/ and archive/.
    }
  }
  return null;
}

function tryGitBuffer(commit, repoPath) {
  try {
    return runGit(['show', `${commit}:${repoPath}`], { binary: true });
  } catch (_error) {
    return null;
  }
}

function parseLog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [commit, committedAt = ''] = line.split('\t');
      return { commit, committedAt };
    });
}

function logForPath(repoPath, follow = false) {
  const args = ['log', '--format=%H%x09%cI'];
  if (follow) {
    args.push('--follow');
  }
  args.push('--', repoPath);

  try {
    return parseLog(runGit(args));
  } catch (_error) {
    return [];
  }
}

function normalizeResourceUrl(value) {
  return String(value || '').split(/[?#]/, 1)[0];
}

function extractResourcePaths(markdown) {
  const matches = String(markdown || '').match(/\/(?:snippets|assets\/posts)\/[^\s)"']+/g) || [];
  return [...new Set(matches.map(normalizeResourceUrl).filter(Boolean))].sort();
}

function resourceRepoPath(resourceUrl) {
  const withoutLeadingSlash = String(resourceUrl || '').replace(/^\/+/, '');
  try {
    return decodeURIComponent(withoutLeadingSlash);
  } catch (_error) {
    return withoutLeadingSlash;
  }
}

function versionedResourceUrl(slug, version, resourceUrl) {
  return `/history-assets/${encodeURIComponent(slug)}/v${version}/resources/${String(resourceUrl).replace(/^\/+/, '')}`;
}

function rewriteResourceLinks(markdown, slug, version) {
  let output = String(markdown || '');
  for (const resourceUrl of extractResourcePaths(output)) {
    output = output.split(resourceUrl).join(versionedResourceUrl(slug, version, resourceUrl));
  }
  return output;
}

function frontmatterValue(markdown, key) {
  const lines = String(markdown || '').split(/\r?\n/);
  if (lines[0] !== '---') {
    return '';
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === '---') {
      break;
    }
    const match = lines[index].match(new RegExp(`^${key}:\\s*(.*)$`));
    if (match) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

function snapshotHash(markdown, resources) {
  const hash = crypto.createHash('sha256');
  hash.update(markdown);

  for (const resource of resources) {
    hash.update('\0');
    hash.update(resource.url);
    hash.update('\0');
    if (resource.content) {
      hash.update(resource.content);
    } else {
      hash.update('<missing>');
    }
  }

  return hash.digest('hex');
}

async function listMarkdownFiles(directory, prefix) {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({ fileName: entry.name, repoPath: `${prefix}/${entry.name}` }));
}

async function resetHistoryDirectory() {
  await fsp.mkdir(historyDir, { recursive: true });
  const entries = await fsp.readdir(historyDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.name !== '.gitkeep')
    .map((entry) => fsp.rm(path.join(historyDir, entry.name), { recursive: true, force: true })));
}

async function buildHistoryForPost(source) {
  const slug = source.fileName.replace(/\.md$/i, '');
  const candidatePostPaths = [`posts/${source.fileName}`, `archive/${source.fileName}`];
  const commitMap = new Map();

  for (const candidatePath of candidatePostPaths) {
    for (const entry of logForPath(candidatePath, true)) {
      commitMap.set(entry.commit, entry);
    }
  }

  const markdownSnapshots = [];
  for (const entry of commitMap.values()) {
    const snapshot = tryGitText(entry.commit, candidatePostPaths);
    if (snapshot) {
      markdownSnapshots.push({ ...entry, ...snapshot });
    }
  }

  const allResourcePaths = new Set();
  for (const snapshot of markdownSnapshots) {
    for (const resourceUrl of extractResourcePaths(snapshot.content)) {
      allResourcePaths.add(resourceRepoPath(resourceUrl));
    }
  }

  for (const resourcePath of allResourcePaths) {
    for (const entry of logForPath(resourcePath)) {
      commitMap.set(entry.commit, entry);
    }
  }

  const commits = [...commitMap.values()].sort((left, right) => {
    const dateDelta = Date.parse(left.committedAt) - Date.parse(right.committedAt);
    return dateDelta || left.commit.localeCompare(right.commit);
  });

  const versions = [];
  let previousHash = '';

  for (const entry of commits) {
    const snapshot = tryGitText(entry.commit, candidatePostPaths);
    if (!snapshot) {
      continue;
    }

    const resourceUrls = extractResourcePaths(snapshot.content);
    const resources = resourceUrls.map((url) => ({
      url,
      repoPath: resourceRepoPath(url),
      content: tryGitBuffer(entry.commit, resourceRepoPath(url))
    }));

    const hash = snapshotHash(snapshot.content, resources);
    if (hash === previousHash) {
      continue;
    }

    const version = versions.length + 1;
    const versionDir = path.join(historyDir, slug, `v${version}`);
    await fsp.mkdir(versionDir, { recursive: true });
    await fsp.writeFile(
      path.join(versionDir, 'post.md'),
      rewriteResourceLinks(snapshot.content, slug, version),
      'utf8'
    );

    for (const resource of resources) {
      if (!resource.content) {
        continue;
      }
      const destination = path.join(versionDir, 'resources', resource.repoPath);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.writeFile(destination, resource.content);
    }

    versions.push({
      version,
      commit: entry.commit,
      committedAt: entry.committedAt,
      sourcePath: snapshot.path,
      resourceCount: resources.filter((resource) => resource.content).length
    });
    previousHash = hash;
  }

  const manifestDir = path.join(historyDir, slug);
  await fsp.mkdir(manifestDir, { recursive: true });
  const currentRaw = await fsp.readFile(path.join(root, source.repoPath), 'utf8');
  const manifest = {
    slug,
    title: frontmatterValue(currentRaw, 'title') || slug,
    status: source.repoPath.startsWith('archive/') ? 'archived' : 'published',
    currentVersion: versions.length,
    generatedAt: new Date().toISOString(),
    versions
  };
  await fsp.writeFile(path.join(manifestDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function main() {
  runGit(['rev-parse', '--is-inside-work-tree']);
  await resetHistoryDirectory();

  const sources = [
    ...(await listMarkdownFiles(postsDir, 'posts')),
    ...(await listMarkdownFiles(archiveDir, 'archive'))
  ];

  const manifests = [];
  for (const source of sources.sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    manifests.push(await buildHistoryForPost(source));
  }

  const totalVersions = manifests.reduce((sum, manifest) => sum + manifest.currentVersion, 0);
  console.log(`Built history for ${manifests.length} post(s), ${totalVersions} version(s).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  extractResourcePaths,
  resourceRepoPath,
  versionedResourceUrl,
  rewriteResourceLinks,
  frontmatterValue,
  snapshotHash
};
