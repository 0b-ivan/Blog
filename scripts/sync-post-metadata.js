const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

const postsDir = path.join(__dirname, '..', 'posts');
const defaultAuthor = process.env.POST_AUTHOR || 'obivan';
const defaultReviewer = process.env.POST_REVIEWED_BY || 'pending';
const touchUpdated = process.argv.includes('--touch-updated');

function slugify(fileName) {
  return fileName.replace(/\.md$/i, '');
}

function inferDateFromFileName(fileName) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : '';
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));

  let touched = 0;

  for (const file of files) {
    const fullPath = path.join(postsDir, file.name);
    const raw = await fs.readFile(fullPath, 'utf-8');
    const parsed = matter(raw);
    const data = { ...parsed.data };

    const inferredDate = inferDateFromFileName(file.name);
    const currentDate = normalizeDate(data.date) || inferredDate;
    const createdAt = normalizeDate(data.created_at) || currentDate || todayDate();

    data.id = String(data.id || slugify(file.name)).trim();
    data.version = String(data.version || '1').trim();
    data.author = String(data.author || defaultAuthor).trim();
    data.reviewed_by = String(data.reviewed_by || defaultReviewer).trim();
    data.date = currentDate || createdAt;
    data.created_at = createdAt;

    if (touchUpdated) {
      data.updated_at = todayDate();
    } else {
      data.updated_at = normalizeDate(data.updated_at) || createdAt;
    }

    const next = matter.stringify(parsed.content, data, { lineWidth: 0 });

    if (next !== raw) {
      await fs.writeFile(fullPath, next, 'utf-8');
      touched += 1;
    }
  }

  console.log(`Updated ${touched} post file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
