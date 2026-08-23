#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  mergeSuggestions,
  renderMarkdownReport,
  renderTextReport,
  suggestGlossaryTerms
} = require('../lib/glossary-suggestions');

function parseOptions(args) {
  const options = {
    files: [],
    format: 'text',
    output: ''
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];

    if (argument === '--format' && value) {
      options.format = value.trim().toLowerCase();
      index += 1;
    } else if (argument === '--output' && value) {
      options.output = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    } else {
      options.files.push(argument);
    }
  }

  if (!['json', 'markdown', 'text'].includes(options.format)) {
    throw new Error(`Unsupported format '${options.format}'. Expected text, markdown or json.`);
  }

  return options;
}

async function markdownFiles(root, explicitFiles) {
  if (explicitFiles.length > 0) {
    return explicitFiles.map((file) => path.resolve(root, file));
  }

  const postsDir = path.join(root, 'posts');
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(postsDir, entry.name))
    .sort();
}

async function loadIgnoredTerms(root) {
  const ignorePath = path.join(root, 'config', 'glossary-suggestion-ignore.json');
  try {
    const raw = await fs.readFile(ignorePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
      throw new Error('expected a JSON array of strings');
    }
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw new Error(`Could not load ${ignorePath}: ${error.message}`, { cause: error });
  }
}

function renderReport(suggestions, format, scannedFiles) {
  if (format === 'json') {
    return `${JSON.stringify({ scannedFiles, suggestions }, null, 2)}\n`;
  }
  if (format === 'markdown') {
    return renderMarkdownReport(suggestions, { scannedFiles });
  }
  return renderTextReport(suggestions, { scannedFiles });
}

async function run(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const ignoredTerms = options.ignoredTerms || await loadIgnoredTerms(root);
  const files = await markdownFiles(root, options.files || []);
  const groups = [];

  for (const file of files) {
    const markdown = await fs.readFile(file, 'utf8');
    const displayPath = path.relative(root, file).split(path.sep).join('/');
    groups.push(suggestGlossaryTerms(markdown, {
      file: displayPath,
      ignoredTerms
    }));
  }

  return {
    scannedFiles: files.length,
    suggestions: mergeSuggestions(groups)
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await run({ files: options.files });
  const report = renderReport(result.suggestions, options.format, result.scannedFiles);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, report, 'utf8');
    console.log(`Glossar-Vorschläge: ${result.suggestions.length}; Bericht: ${outputPath}`);
    return;
  }

  process.stdout.write(report);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(2);
  });
}

module.exports = {
  loadIgnoredTerms,
  markdownFiles,
  parseOptions,
  renderReport,
  run
};
