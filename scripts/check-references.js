const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'posts', '_sources.json');
const SOURCE_LINK_RE = /\]\(\/sources\.html#([a-z0-9][a-z0-9._-]*)[^)]*\)/gi;
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function slugFromWikiName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function markdownFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(directory, entry.name));
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function resolvesWikiTarget(target, activeSlugs) {
  const normalized = slugFromWikiName(target);
  if (!normalized) {
    return false;
  }

  return activeSlugs.some((slug) => {
    const candidate = slugFromWikiName(slug);
    return candidate === normalized || candidate.endsWith(`-${normalized}`);
  });
}

async function main() {
  const errors = [];
  const warnings = [];
  const catalog = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
  const sourceIds = new Set(Object.keys(catalog));
  const usedSourceIds = new Set();

  for (const [id, source] of Object.entries(catalog)) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      errors.push(`Invalid source id: ${id}`);
    }
    if (!source || typeof source.title !== 'string' || !source.title.trim()) {
      errors.push(`Source ${id} has no title`);
    }
    if (!source || typeof source.publisher !== 'string' || !source.publisher.trim()) {
      errors.push(`Source ${id} has no publisher`);
    }
    if (!source || !isValidHttpUrl(source.url)) {
      errors.push(`Source ${id} has invalid URL: ${source?.url || '<missing>'}`);
    }
  }

  const activeFiles = await markdownFiles(path.join(root, 'posts'));
  const archiveFiles = await markdownFiles(path.join(root, 'archive'));
  const activeSlugs = activeFiles.map((file) => path.basename(file, '.md'));

  for (const file of [...activeFiles, ...archiveFiles]) {
    const content = await fs.readFile(file, 'utf8');
    const relative = path.relative(root, file);
    const sourceIdsInPost = new Set();

    for (const match of content.matchAll(SOURCE_LINK_RE)) {
      const id = match[1];
      sourceIdsInPost.add(id);
      usedSourceIds.add(id);
      if (!sourceIds.has(id)) {
        errors.push(`${relative}: unknown source id '${id}'`);
      }
    }

    if (file.includes(`${path.sep}posts${path.sep}`) && sourceIdsInPost.size === 0) {
      warnings.push(`${relative}: no central source references`);
    }

    if (file.includes(`${path.sep}posts${path.sep}`)) {
      for (const match of content.matchAll(WIKI_LINK_RE)) {
        const target = match[1].trim();
        if (!resolvesWikiTarget(target, activeSlugs)) {
          errors.push(`${relative}: unresolved wiki-link target '${target}'`);
        }
      }
    }
  }

  for (const id of sourceIds) {
    if (!usedSourceIds.has(id)) {
      warnings.push(`Unused source: ${id}`);
    }
  }

  for (const warning of warnings) {
    console.warn(`[WARN] ${warning}`);
  }

  if (errors.length) {
    for (const error of errors) {
      console.error(`[ERROR] ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`References OK: ${activeFiles.length} active posts, ${sourceIds.size} central sources, ${usedSourceIds.size} used sources.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
