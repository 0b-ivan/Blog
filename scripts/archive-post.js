const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');
const postsDir = path.join(root, 'posts');
const archiveDir = path.join(root, 'archive');

function normalizeIdentifier(value) {
  return String(value || '')
    .trim()
    .replace(/\.md$/i, '')
    .toLowerCase();
}

async function findPostFile(directory, identifier) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) {
    throw new Error('Post slug or filename is required.');
  }

  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  const exact = markdownFiles.find((name) => normalizeIdentifier(name) === normalized);
  if (exact) {
    return exact;
  }

  const suffixMatches = markdownFiles.filter((name) => normalizeIdentifier(name).endsWith(`-${normalized}`));
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  if (suffixMatches.length > 1) {
    throw new Error(`Identifier '${identifier}' is ambiguous: ${suffixMatches.join(', ')}`);
  }

  return null;
}

async function assertDestinationFree(destination) {
  try {
    await fs.access(destination);
    throw new Error(`Destination already exists: ${destination}`);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function movePost(action, identifier) {
  const isRestore = action === 'restore';
  const sourceDir = isRestore ? archiveDir : postsDir;
  const destinationDir = isRestore ? postsDir : archiveDir;
  const fileName = await findPostFile(sourceDir, identifier);

  if (!fileName) {
    const label = isRestore ? 'archive' : 'posts';
    throw new Error(`No matching post found in ${label}/ for '${identifier}'.`);
  }

  await fs.mkdir(destinationDir, { recursive: true });

  const source = path.join(sourceDir, fileName);
  const destination = path.join(destinationDir, fileName);
  await assertDestinationFree(destination);
  await fs.rename(source, destination);

  return path.relative(root, destination);
}

async function main() {
  const [action, identifier] = process.argv.slice(2);

  if (!['archive', 'restore'].includes(action) || !identifier) {
    console.error('Usage: node scripts/archive-post.js <archive|restore> <slug-or-filename>');
    process.exit(1);
  }

  const destination = await movePost(action, identifier);
  const verb = action === 'archive' ? 'Archived' : 'Restored';
  console.log(`${verb}: ${destination}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  normalizeIdentifier,
  findPostFile,
  movePost
};
