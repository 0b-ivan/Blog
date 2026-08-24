const fs = require('node:fs/promises');
const path = require('node:path');

function slugifyTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseOptions(args) {
  const options = {
    title: '',
    category: 'IT',
    tags: [],
    excerpt: ''
  };

  if (args.length === 0 || args[0].startsWith('--')) {
    return options;
  }

  options.title = args[0].trim();

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    const nextValue = args[index + 1];

    if (argument === '--category' && nextValue) {
      options.category = nextValue.trim();
      index += 1;
    } else if (argument === '--tags' && nextValue) {
      options.tags = nextValue
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      index += 1;
    } else if (argument === '--excerpt' && nextValue) {
      options.excerpt = nextValue.trim();
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
  }

  return options;
}

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function renderPost({ id, title, date, publishedAt, category, tags, excerpt }) {
  const tagsYaml = tags.length > 0
    ? `\n${tags.map((tag) => `  - ${yamlString(tag)}`).join('\n')}`
    : ' []';

  return `---\nid: ${id}\nversion: 1\ntitle: ${yamlString(title)}\ndate: ${date}\npublished_at: ${publishedAt}\ncreated_at: ${date}\nupdated_at: ${date}\nauthor: obivan\nreviewed_by: pending\ncategory: ${yamlString(category)}\nexcerpt: ${yamlString(excerpt)}\ntags:${tagsYaml}\n---\n\n# ${title}\n\n`;
}

function renderSearchRegressionFixture(id) {
  return `${JSON.stringify({ post: id, queries: [] }, null, 2)}\n`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.title) {
    console.error('Usage: npm run post:new -- "Mein Artikel" [--category DevOps] [--tags "Docker,CI/CD"] [--excerpt "Kurzbeschreibung"]');
    process.exit(1);
  }

  const slug = slugifyTitle(options.title);
  if (!slug) {
    console.error('Could not build a valid slug from the title.');
    process.exit(1);
  }

  const now = new Date();
  const date = localDateString(now);
  const publishedAt = now.toISOString();
  const id = `${date}-${slug}`;
  const repoRoot = path.join(__dirname, '..');
  const postsDir = path.join(repoRoot, 'posts');
  const targetPath = path.join(postsDir, `${id}.md`);
  const regressionDir = path.join(repoRoot, 'rag', 'regression', 'cases');
  const regressionPath = path.join(regressionDir, `${id}.json`);

  try {
    await fs.access(targetPath);
    console.error(`Post already exists: ${targetPath}`);
    process.exit(1);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  const content = renderPost({
    id,
    title: options.title,
    date,
    publishedAt,
    category: options.category,
    tags: options.tags,
    excerpt: options.excerpt
  });

  await fs.writeFile(targetPath, content, 'utf-8');
  await fs.mkdir(regressionDir, { recursive: true });
  await fs.writeFile(regressionPath, renderSearchRegressionFixture(id), { encoding: 'utf-8', flag: 'wx' });

  console.log(`Created ${path.relative(repoRoot, targetPath)}`);
  console.log(`Created ${path.relative(repoRoot, regressionPath)}`);
  console.log('Add at least one semantic search query to the regression fixture before merging.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  slugifyTitle,
  localDateString,
  parseOptions,
  renderPost,
  renderSearchRegressionFixture
};
