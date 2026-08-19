const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

const postsDir = path.join(__dirname, '..', 'posts');
const requiredFields = ['id', 'version', 'created_at', 'updated_at', 'author', 'reviewed_by'];

function isValidDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function isPresent(value) {
  return String(value || '').trim().length > 0;
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

    if (isPresent(data.created_at) && !isValidDate(data.created_at)) {
      violations.push(`${file.name}: invalid created_at date, expected YYYY-MM-DD`);
    }

    if (isPresent(data.updated_at) && !isValidDate(data.updated_at)) {
      violations.push(`${file.name}: invalid updated_at date, expected YYYY-MM-DD`);
    }

    if (isPresent(data.date) && !isValidDate(data.date)) {
      violations.push(`${file.name}: invalid date field, expected YYYY-MM-DD`);
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
