const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SITE_URL = 'https://blog.obivan.org';
const DEFAULT_OUTPUT = path.join(ROOT, 'assets', 'posts', 'downloads', 'kernel-notes.epub');
const DEFAULT_SOURCE = path.join(ROOT, '.ebook', 'kernel-notes.md');
const DEFAULT_CSS = path.join(ROOT, 'assets', 'ebook.css');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseScalar(value) {
  const text = String(value || '').trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return text.slice(1, -1);
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { data: {}, content: text };
  }

  const closing = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closing < 0) {
    return { data: {}, content: text };
  }

  const data = {};
  for (const line of lines.slice(1, closing)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    data[match[1]] = parseScalar(match[2]);
  }

  return {
    data,
    content: lines.slice(closing + 1).join('\n')
  };
}

function stripManagedGlossary(markdown) {
  return String(markdown || '').replace(
    /<!-- glossary:start -->[\s\S]*?<!-- glossary:end -->\s*/g,
    ''
  );
}

function resolvePostSlug(target, posts) {
  const normalized = slugify(target);
  if (!normalized) {
    return null;
  }

  const exact = posts.find((post) => slugify(post.slug) === normalized || slugify(post.title) === normalized);
  if (exact) {
    return exact.slug;
  }

  const suffix = posts.find((post) => slugify(post.slug).endsWith(`-${normalized}`));
  return suffix?.slug || null;
}

function rewriteTextLine(line, posts, siteUrl) {
  let output = line.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const cleanTarget = String(target || '').trim();
    const cleanLabel = String(label || cleanTarget).trim();
    const resolved = resolvePostSlug(cleanTarget, posts);
    if (resolved) {
      return `[${cleanLabel}](#post-${resolved})`;
    }
    const fallback = slugify(cleanTarget);
    return fallback ? `[${cleanLabel}](${siteUrl}/posts/${fallback})` : cleanLabel;
  });

  output = output.replace(/\]\(\/posts\/([^\s)#]+)(#[^\s)]*)?([^)]*)\)/g, (_match, slug, hash, rest) => {
    const resolved = resolvePostSlug(slug, posts);
    return resolved
      ? `](#post-${resolved}${hash || ''}${rest || ''})`
      : `](${siteUrl}/posts/${slug}${hash || ''}${rest || ''})`;
  });

  output = output
    .replace(/\]\(\/assets\//g, '](assets/')
    .replace(/\bsrc="\/assets\//g, 'src="assets/')
    .replace(/\bsrc='\/assets\//g, "src='assets/")
    .replace(/\bhref="\/posts\/([^"#]+)(#[^"]*)?"/g, (_match, slug, hash) => {
      const resolved = resolvePostSlug(slug, posts);
      return resolved
        ? `href="#post-${resolved}${hash || ''}"`
        : `href="${siteUrl}/posts/${slug}${hash || ''}"`;
    })
    .replace(/\bhref='\/posts\/([^'#]+)(#[^']*)?'/g, (_match, slug, hash) => {
      const resolved = resolvePostSlug(slug, posts);
      return resolved
        ? `href='#post-${resolved}${hash || ''}'`
        : `href='${siteUrl}/posts/${slug}${hash || ''}'`;
    })
    .replace(/\]\(\/(?!assets\/)([^)]*)\)/g, `](${siteUrl}/$1)`)
    .replace(/\bhref="\/(?!\/)([^"]*)"/g, `href="${siteUrl}/$1"`)
    .replace(/\bhref='\/(?!\/)([^']*)'/g, `href='${siteUrl}/$1'`);

  return output;
}

function rewriteBody(markdown, posts, siteUrl) {
  const lines = stripManagedGlossary(markdown).split(/\r?\n/);
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

    output.push(fence ? line : rewriteTextLine(line, posts, siteUrl));
  }

  return output.join('\n').trim();
}

function comparableDate(value, fallback) {
  const timestamp = Date.parse(String(value || fallback || ''));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function loadPosts(postsDir) {
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  const posts = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(postsDir, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    const slug = file.replace(/\.md$/i, '');
    const inferredDate = slug.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1] || '';
    posts.push({
      slug,
      title: parsed.data.title || slug,
      date: parsed.data.date || parsed.data.created_at || inferredDate,
      publishedAt: parsed.data.published_at || parsed.data.date || parsed.data.created_at || inferredDate,
      category: parsed.data.category || 'IT',
      content: parsed.content
    });
  }

  posts.sort((left, right) => {
    const byDate = comparableDate(left.publishedAt, left.date) - comparableDate(right.publishedAt, right.date);
    return byDate || left.slug.localeCompare(right.slug, 'de');
  });
  return posts;
}

async function loadGlossary(root = ROOT) {
  const sources = [path.join(root, 'config', 'glossary.json')];
  const topicDir = path.join(root, 'config', 'glossary');
  try {
    const entries = await fs.readdir(topicDir, { withFileTypes: true });
    sources.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(topicDir, entry.name))
        .sort()
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const glossary = new Map();
  for (const source of sources) {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(source, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (glossary.has(key)) {
        throw new Error(`Duplicate glossary key: ${key}`);
      }
      glossary.set(key, value || {});
    }
  }

  return [...glossary.entries()]
    .map(([key, value]) => ({
      key,
      full: String(value.full || key).trim(),
      short: String(value.short || '').trim(),
      description: String(value.description || value.short || '').trim()
    }))
    .sort((left, right) => left.key.localeCompare(right.key, 'de', { sensitivity: 'base' }));
}

function renderGlossary(glossary) {
  const sections = ['# Glossar {#glossar}', '', 'Fachbegriffe und Abkürzungen aus den Artikeln.', ''];
  let currentLetter = '';

  for (const entry of glossary) {
    const letter = (entry.key[0] || '#').toLocaleUpperCase('de');
    if (letter !== currentLetter) {
      currentLetter = letter;
      sections.push(`## ${letter}`, '');
    }

    sections.push(`### ${entry.key} {#glossary-${slugify(entry.key)}}`, '');
    if (entry.full && entry.full !== entry.key) {
      sections.push(`**${entry.full}**`, '');
    }
    if (entry.short) {
      sections.push(entry.short, '');
    }
    if (entry.description && entry.description !== entry.short) {
      sections.push(entry.description, '');
    }
  }

  return sections.join('\n').trim();
}

function renderBookMarkdown(posts, glossary, options = {}) {
  const siteUrl = String(options.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
  const buildDate = options.buildDate || new Date().toISOString().slice(0, 10);
  const parts = [
    '# Über dieses E-Book {.unnumbered}',
    '',
    `Dieses E-Book wird automatisch aus den veröffentlichten Artikeln von [Kernel Notes](${siteUrl}) erzeugt.`,
    '',
    `Stand: ${buildDate} · ${posts.length} Artikel`,
    '',
    '---',
    ''
  ];

  for (const post of posts) {
    const meta = [post.date, post.category].filter(Boolean).join(' · ');
    parts.push(
      `<div class="page-break"></div>`,
      '',
      `# ${post.title} {#post-${post.slug}}`,
      '',
      meta ? `_${meta}_` : '',
      '',
      rewriteBody(post.content, posts, siteUrl),
      '',
      `[Online lesen](${siteUrl}/posts/${post.slug})`,
      '',
      '---',
      ''
    );
  }

  parts.push('<div class="page-break"></div>', '', renderGlossary(glossary), '');
  return parts.filter((part, index, all) => part !== '' || all[index - 1] !== '').join('\n');
}

async function buildSource(options = {}) {
  const root = options.root || ROOT;
  const postsDir = options.postsDir || process.env.POSTS_DIR || path.join(root, 'posts');
  const sourcePath = options.sourcePath || DEFAULT_SOURCE;
  const siteUrl = options.siteUrl || process.env.SITE_URL || DEFAULT_SITE_URL;
  const posts = await loadPosts(postsDir);
  const glossary = await loadGlossary(root);
  const markdown = renderBookMarkdown(posts, glossary, {
    siteUrl,
    buildDate: options.buildDate || process.env.EBOOK_BUILD_DATE
  });

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, `${markdown}\n`, 'utf8');
  return { sourcePath, posts: posts.length, glossary: glossary.length };
}

function runPandoc(sourcePath, outputPath, options = {}) {
  const root = options.root || ROOT;
  const cssPath = options.cssPath || DEFAULT_CSS;
  const buildDate = options.buildDate || process.env.EBOOK_BUILD_DATE || new Date().toISOString().slice(0, 10);
  const args = [
    sourcePath,
    '--from=markdown+fenced_divs+footnotes+pipe_tables+strikeout+autolink_bare_uris',
    '--to=epub3',
    '--standalone',
    '--toc',
    '--toc-depth=2',
    '--epub-chapter-level=1',
    '--metadata=title:Kernel Notes',
    '--metadata=subtitle:Praktische Technik statt Buzzword-Folien',
    '--metadata=author:Ivan Babayev',
    '--metadata=lang:de-DE',
    `--metadata=date:${buildDate}`,
    `--resource-path=${root}`,
    `--css=${cssPath}`,
    `--output=${outputPath}`
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PANDOC_BIN || 'pandoc', args, {
      cwd: root,
      stdio: 'inherit'
    });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('pandoc wurde nicht gefunden. Bitte Pandoc installieren oder PANDOC_BIN setzen.'));
        return;
      }
      reject(error);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pandoc exited with code ${code}`));
      }
    });
  });
}

async function buildEbook(options = {}) {
  const root = options.root || ROOT;
  const outputPath = options.outputPath || process.env.EBOOK_OUTPUT || DEFAULT_OUTPUT;
  const source = await buildSource({ ...options, root });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runPandoc(source.sourcePath, outputPath, { ...options, root });
  return { ...source, outputPath };
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
  slugify,
  parseFrontmatter,
  stripManagedGlossary,
  resolvePostSlug,
  rewriteTextLine,
  rewriteBody,
  loadPosts,
  loadGlossary,
  renderGlossary,
  renderBookMarkdown,
  buildSource,
  runPandoc,
  buildEbook
};
