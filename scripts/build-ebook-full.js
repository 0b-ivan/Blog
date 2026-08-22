const fs = require('node:fs/promises');
const path = require('node:path');
const {
  loadPosts,
  loadGlossary,
  renderBookMarkdown,
  runPandoc
} = require('./build-ebook');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SITE_URL = 'https://blog.obivan.org';

function sliceSnippet(source, range) {
  const match = String(range || '').match(/^(\d+)-(\d+)$/);
  if (!match) {
    return source;
  }

  const start = Math.max(1, Number.parseInt(match[1], 10));
  const end = Math.max(start, Number.parseInt(match[2], 10));
  return String(source).split(/\r?\n/).slice(start - 1, end).join('\n');
}

function codeFence(source) {
  const runs = String(source || '').match(/`+/g) || [];
  const longest = runs.reduce((max, value) => Math.max(max, value.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function safeSnippetPath(snippetsDir, reference) {
  const decoded = decodeURIComponent(String(reference || ''));
  if (!decoded || decoded.includes('\0')) {
    throw new Error(`Invalid snippet path: ${reference}`);
  }

  const target = path.resolve(snippetsDir, decoded);
  const root = `${path.resolve(snippetsDir)}${path.sep}`;
  if (!target.startsWith(root)) {
    throw new Error(`Snippet path escapes snippets directory: ${reference}`);
  }
  return target;
}

async function expandSnippetLinks(markdown, options = {}) {
  const snippetsDir = options.snippetsDir || path.join(ROOT, 'snippets');
  const siteUrl = String(options.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
  const pattern = /\[([^\]\n]+)\]\(\/snippets\/([^\s)]+)\s+"snippet:([^":]*)(?::([^"]*))?"\)/g;
  const source = String(markdown || '');
  const matches = [...source.matchAll(pattern)];
  if (!matches.length) {
    return source;
  }

  let cursor = 0;
  let output = '';
  for (const match of matches) {
    output += source.slice(cursor, match.index);
    const [full, title, reference, language, range] = match;
    const filePath = safeSnippetPath(snippetsDir, reference);
    let snippet;
    try {
      snippet = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Referenced snippet does not exist: ${reference}`, { cause: error });
      }
      throw error;
    }

    const selected = sliceSnippet(snippet, range).replace(/\s+$/, '');
    const fence = codeFence(selected);
    const meta = [language, range ? `Zeilen ${range}` : ''].filter(Boolean).join(' · ');
    const online = `${siteUrl}/snippets/#/${encodeURIComponent(reference)}`;

    output += [
      `**${title}**${meta ? `  \n_${meta}_` : ''}`,
      '',
      `${fence}${language || ''}`,
      selected,
      fence,
      '',
      `[Snippet online öffnen](${online})`
    ].join('\n');
    cursor = match.index + full.length;
  }

  output += source.slice(cursor);
  return output;
}

function namespaceFootnotes(markdown, namespace) {
  const safeNamespace = String(namespace || 'post').replace(/[^A-Za-z0-9_-]/g, '-');
  const lines = String(markdown || '').split(/\r?\n/);
  const output = [];
  let fence = null;

  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      const token = marker[1];
      const char = token[0];
      if (!fence) {
        fence = { char, length: token.length };
      } else if (fence.char === char && token.length >= fence.length) {
        fence = null;
      }
      output.push(line);
      continue;
    }

    output.push(fence
      ? line
      : line.replace(/\[\^([A-Za-z0-9_-]+)\]/g, `[^${safeNamespace}-$1]`));
  }

  return output.join('\n');
}

async function preparePosts(options = {}) {
  const root = options.root || ROOT;
  const siteUrl = options.siteUrl || process.env.SITE_URL || DEFAULT_SITE_URL;
  const postsDir = options.postsDir || process.env.POSTS_DIR || path.join(root, 'posts');
  const snippetsDir = options.snippetsDir || path.join(root, 'snippets');
  const posts = await loadPosts(postsDir);

  for (const post of posts) {
    const expanded = await expandSnippetLinks(post.content, { snippetsDir, siteUrl });
    post.content = namespaceFootnotes(expanded, post.slug);
  }
  return posts;
}

async function buildEbook(options = {}) {
  const root = options.root || ROOT;
  const siteUrl = options.siteUrl || process.env.SITE_URL || DEFAULT_SITE_URL;
  const sourcePath = options.sourcePath || path.join(root, '.ebook', 'kernel-notes.md');
  const outputPath = options.outputPath || process.env.EBOOK_OUTPUT || path.join(root, 'assets', 'posts', 'downloads', 'kernel-notes.epub');
  const cssPath = options.cssPath || path.join(root, 'assets', 'ebook.css');
  const buildDate = options.buildDate || process.env.EBOOK_BUILD_DATE || new Date().toISOString().slice(0, 10);

  const posts = await preparePosts({ ...options, root, siteUrl });
  const glossary = await loadGlossary(root);
  const markdown = renderBookMarkdown(posts, glossary, { siteUrl, buildDate });

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(sourcePath, `${markdown}\n`, 'utf8');
  await runPandoc(sourcePath, outputPath, { root, cssPath, buildDate });

  return { outputPath, posts: posts.length, glossary: glossary.length };
}

async function main() {
  try {
    const result = await buildEbook();
    console.log(`EPUB erstellt: ${path.relative(ROOT, result.outputPath)} (${result.posts} Artikel, ${result.glossary} Glossarbegriffe)`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  sliceSnippet,
  codeFence,
  safeSnippetPath,
  expandSnippetLinks,
  namespaceFootnotes,
  preparePosts,
  buildEbook
};
