const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

const postsDir = path.join(__dirname, '..', 'posts');
const requiredFields = ['id', 'version', 'created_at', 'updated_at', 'author', 'reviewed_by'];

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

  // Strict calendar validation (e.g. reject 2026-02-31).
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

async function main() {
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));

  const violations = [];

  for (const file of files) {
    const fullPath = path.join(postsDir, file.name);
    const raw = await fs.readFile(fullPath, 'utf-8');
    let parsed;
    try {
      parsed = matter(raw);
    } catch (error) {
      const reason = error && error.reason ? error.reason : String(error);
      violations.push(`${file.name}: invalid frontmatter YAML (${reason})`);
      continue;
    }
    const data = parsed.data || {};

    for (const field of requiredFields) {
      if (!isPresent(data[field])) {
        violations.push(`${file.name}: missing required field '${field}'`);
      }
    }

    if (isPresent(data.created_at) && !normalizeDateValue(data.created_at)) {
      violations.push(`${file.name}: invalid created_at date, expected YYYY-MM-DD (${describeValue(data.created_at)})`);
    }

    if (isPresent(data.updated_at) && !normalizeDateValue(data.updated_at)) {
      violations.push(`${file.name}: invalid updated_at date, expected YYYY-MM-DD (${describeValue(data.updated_at)})`);
    }

    if (isPresent(data.date) && !normalizeDateValue(data.date)) {
      violations.push(`${file.name}: invalid date field, expected YYYY-MM-DD (${describeValue(data.date)})`);
    }
  }

  if (violations.length > 0) {
    console.error('Frontmatter validation failed:');
    violations.forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log(`Frontmatter validation passed for ${files.length} post(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
