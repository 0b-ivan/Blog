const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 20;

function parseArgs(args) {
  let limit = DEFAULT_LIMIT;
  let includeExisting = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--limit') {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
        throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
      }
      limit = value;
      index += 1;
      continue;
    }

    if (arg === '--include-existing') {
      includeExisting = true;
      continue;
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  return { limit, includeExisting };
}

function frontmatterBlock(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return text;
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end > 0 ? lines.slice(1, end).join('\n') : text;
}

function metadataValue(raw, key) {
  const block = frontmatterBlock(raw);
  const pattern = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'mi');
  const match = block.match(pattern);
  return String(match?.[1] || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

function isPublished(raw) {
  const status = metadataValue(raw, 'status').toLowerCase();
  return status !== 'draft' && status !== 'archived';
}

function isPublishedWithoutCover(raw) {
  if (!isPublished(raw)) return false;

  const cover = metadataValue(raw, 'cover_image').toLowerCase();
  return !cover || cover === 'null' || cover === '~';
}

async function listMissingCoverPosts(options = {}) {
  const postsDir = options.postsDir || path.join(root, 'posts');
  const limit = options.limit ?? DEFAULT_LIMIT;
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, 'en'));

  const missing = [];
  for (const filename of markdownFiles) {
    const absolute = path.join(postsDir, filename);
    const raw = await fs.readFile(absolute, 'utf8');
    const eligible = options.includeExisting
      ? isPublished(raw)
      : isPublishedWithoutCover(raw);
    if (!eligible) continue;

    missing.push(`posts/${filename}`);
    if (missing.length >= limit) break;
  }

  return missing;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const posts = await listMissingCoverPosts(options);
  if (posts.length) process.stdout.write(`${posts.join('\n')}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  frontmatterBlock,
  isPublished,
  isPublishedWithoutCover,
  listMissingCoverPosts,
  metadataValue,
  parseArgs
};
