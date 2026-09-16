const { resolveSnippets } = require('../lib/snippets');
const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');
const contentDirs = [
  { label: 'posts', path: path.join(root, 'posts') },
  { label: 'archive', path: path.join(root, 'archive') }
];
const requiredFields = ['id', 'version', 'created_at', 'updated_at', 'author', 'reviewed_by'];
const allowedStatuses = new Set(['draft', 'publish', 'archived']);

function normalizeDateFromDateObject(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toISOString().slice(0, 10);
}

function normalizeDateFromString(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(utcDate.getTime())) {
    return '';
  }

  const isSameDate =
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;

  if (!isSameDate) {
    return '';
  }

  return utcDate.toISOString().slice(0, 10);
}

function normalizeDateValue(value) {
  if (value instanceof Date) {
    return normalizeDateFromDateObject(value);
  }

  return normalizeDateFromString(value);
}

function isPresent(value) {
  return String(value || '').trim().length > 0;
}

function describeValue(value) {
  if (value instanceof Date) {
    return `type=Date value=${value.toISOString()}`;
  }

  return `type=${typeof value} value=${JSON.stringify(value)}`;
}

function suggestedTag(value) {
  return String(value || '').trim().replace(/\s+/g, '-');
}

function tagValues(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function markdownFiles(directory) {
  try {
    const entries = await fs.readdir(directory.path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => ({ ...directory, name: entry.name }));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function main() {
  const files = (await Promise.all(contentDirs.map(markdownFiles))).flat();
  const violations = [];
  const legacy = JSON.parse(await fs.readFile(path.join(root, 'snippets/manifest.json'), 'utf8'));

  for (const file of files) {
    const fullPath = path.join(file.path, file.name);
    const displayPath = `${file.label}/${file.name}`;
    const raw = await fs.readFile(fullPath, 'utf-8');
    let parsed;
    try {
      parsed = matter(raw);
    } catch (error) {
      const reason = error && error.reason ? error.reason : String(error);
      violations.push(`${displayPath}: invalid frontmatter YAML (${reason})`);
      continue;
    }
    const data = parsed.data || {};
    try {
      resolveSnippets({ slug: file.name.replace(/\.md$/, ''), data, markdown: parsed.content, legacy, snippetsDir: path.join(root, 'snippets') });
    } catch (error) {
      violations.push(`${displayPath}: ${error.message}`);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'reading_time')) {
      violations.push(`${displayPath}: manual 'reading_time' is not allowed; it is calculated from article content`);
    }

    for (const field of requiredFields) {
      if (!isPresent(data[field])) {
        violations.push(`${displayPath}: missing required field '${field}'`);
      }
    }

    if (isPresent(data.status)) {
      const status = String(data.status).trim().toLowerCase();
      if (!allowedStatuses.has(status)) {
        violations.push(`${displayPath}: invalid status '${data.status}', expected draft, publish or archived`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'tags')) {
      if (!Array.isArray(data.tags) && typeof data.tags !== 'string') {
        violations.push(`${displayPath}: 'tags' must be a YAML list or comma-separated string`);
      } else {
        tagValues(data.tags).forEach((tag, index) => {
          const text = String(tag ?? '').trim();
          if (!text) {
            violations.push(`${displayPath}: tags[${index}] must not be empty`);
            return;
          }

          if (/\s/.test(text)) {
            violations.push(`${displayPath}: tag '${text}' contains whitespace; use '${suggestedTag(text)}'`);
          }
        });
      }
    }

    if (isPresent(data.created_at) && !normalizeDateValue(data.created_at)) {
      violations.push(`${displayPath}: invalid created_at date, expected YYYY-MM-DD (${describeValue(data.created_at)})`);
    }

    if (isPresent(data.updated_at) && !normalizeDateValue(data.updated_at)) {
      violations.push(`${displayPath}: invalid updated_at date, expected YYYY-MM-DD (${describeValue(data.updated_at)})`);
    }

    if (isPresent(data.date) && !normalizeDateValue(data.date)) {
      violations.push(`${displayPath}: invalid date field, expected YYYY-MM-DD (${describeValue(data.date)})`);
    }
  }

  if (violations.length > 0) {
    console.error('Frontmatter validation failed:');
    violations.forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log(`Frontmatter validation passed for ${files.length} active/archived post(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
