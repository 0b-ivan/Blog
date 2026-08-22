const fs = require('node:fs/promises');
const path = require('node:path');
const {
  glossaryEntries,
  glossaryTitle
} = require('../lib/glossary');

const START_MARKER = '<!-- glossary:start -->';
const END_MARKER = '<!-- glossary:end -->';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripManagedBlock(markdown) {
  const pattern = new RegExp(
    `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\s*`,
    'g'
  );
  return String(markdown || '').replace(pattern, '');
}

function searchableMarkdown(markdown) {
  let text = stripManagedBlock(markdown);
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
  text = text.replace(/`[^`\n]+`/g, ' ');
  text = text.replace(/^\*\[[^\]]+\]:.*$/gm, ' ');
  text = text.replace(/https?:\/\/[^\s)\]>]+/g, ' ');
  return text;
}

function containsLabel(text, label) {
  const escaped = escapeRegExp(label);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u');
  return pattern.test(text);
}

function usedGlossaryLabels(markdown) {
  const text = searchableMarkdown(markdown);
  const used = [];

  for (const entry of glossaryEntries) {
    for (const label of [entry.key, ...entry.aliases]) {
      if (containsLabel(text, label)) {
        used.push({ entry, label });
      }
    }
  }

  return used;
}

function renderManagedBlock(markdown) {
  const used = usedGlossaryLabels(markdown);
  if (!used.length) {
    return '';
  }

  const definitions = used
    .sort((left, right) => left.label.localeCompare(right.label, 'de', { sensitivity: 'base' }))
    .map(({ entry, label }) => `*[${label}]: ${glossaryTitle(entry)}`)
    .join('\n');

  return `${START_MARKER}\n${definitions}\n${END_MARKER}`;
}

function syncMarkdown(markdown) {
  const withoutManaged = stripManagedBlock(markdown).replace(/\s+$/, '');
  const block = renderManagedBlock(withoutManaged);
  if (!block) {
    return `${withoutManaged}\n`;
  }
  return `${withoutManaged}\n\n${block}\n`;
}

async function markdownFiles(postsDir, explicitFiles) {
  if (explicitFiles.length) {
    return explicitFiles.map((file) => path.resolve(file));
  }

  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(postsDir, entry.name))
    .sort();
}

async function run(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const postsDir = options.postsDir || process.env.POSTS_DIR || path.join(root, 'posts');
  const explicitFiles = options.files || [];
  const check = Boolean(options.check);
  const files = await markdownFiles(postsDir, explicitFiles);
  const changed = [];

  for (const file of files) {
    const current = await fs.readFile(file, 'utf8');
    const next = syncMarkdown(current);
    if (next === current) {
      continue;
    }

    changed.push(file);
    if (!check) {
      await fs.writeFile(file, next, 'utf8');
    }
  }

  return changed;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter((arg) => !arg.startsWith('--'));
  const changed = await run({ check, files });

  if (!changed.length) {
    console.log('Glossar ist bereits synchron.');
    return;
  }

  const verb = check ? 'müssten synchronisiert werden' : 'synchronisiert';
  console.log(`${changed.length} Markdown-Datei(en) ${verb}:`);
  changed.forEach((file) => console.log(`- ${path.relative(process.cwd(), file)}`));

  if (check) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}

module.exports = {
  END_MARKER,
  START_MARKER,
  containsLabel,
  renderManagedBlock,
  run,
  searchableMarkdown,
  stripManagedBlock,
  syncMarkdown,
  usedGlossaryLabels
};
