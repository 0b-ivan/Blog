const fs = require('node:fs/promises');
const path = require('node:path');
const { glossaryEntries, glossarySlug } = require('./glossary');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function stripHtml(value) {
  return decodeHtmlAttribute(String(value || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function safeSnippetPath(assetRoot, snippetPath) {
  const snippetsRoot = path.resolve(assetRoot, 'snippets');
  const requested = path.resolve(snippetsRoot, String(snippetPath || ''));
  if (requested === snippetsRoot || !requested.startsWith(`${snippetsRoot}${path.sep}`)) {
    return '';
  }
  return requested;
}

function snippetRange(title) {
  const parts = String(title || '').split(':');
  const range = parts.length >= 3 ? parts.slice(2).join(':') : '';
  return /^\d+-\d+$/.test(range) ? range : '';
}

function sliceSnippet(source, range) {
  const match = String(range || '').match(/^(\d+)-(\d+)$/);
  if (!match) return String(source || '');

  const start = Math.max(1, Number.parseInt(match[1], 10));
  const end = Math.max(start, Number.parseInt(match[2], 10));
  return String(source || '').split(/\r?\n/).slice(start - 1, end).join('\n');
}

async function expandSnippetLinks(html, assetRoot) {
  const input = String(html || '');
  const linkPattern = /<a\b([^>]*\bdata-snippet="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi;
  let output = '';
  let lastIndex = 0;

  for (const match of input.matchAll(linkPattern)) {
    output += input.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;

    let metadata = {};
    try {
      metadata = JSON.parse(decodeHtmlAttribute(match[2]));
    } catch (_error) {
      output += match[0];
      continue;
    }

    const attributes = match[1];
    const href = attributes.match(/\bhref="([^"]+)"/i)?.[1] || '';
    const titleAttribute = decodeHtmlAttribute(attributes.match(/\btitle="([^"]+)"/i)?.[1] || '');
    const relative = String(metadata.path || href.replace(/^\/snippets\//, '')).trim();
    const absolute = safeSnippetPath(assetRoot, relative);

    if (!absolute) {
      output += match[0];
      continue;
    }

    try {
      const fullSource = await fs.readFile(absolute, 'utf8');
      const range = snippetRange(titleAttribute);
      const source = sliceSnippet(fullSource, range);
      const label = metadata.title || stripHtml(match[3]) || path.basename(relative);
      const language = metadata.language || titleAttribute.split(':')[1] || '';
      const type = metadata.type || language || 'Code';
      const description = metadata.description || metadata.usage || '';
      const meta = [type, range ? `Zeilen ${range}` : ''].filter(Boolean).join(' · ');

      output += `<figure class="ebook-snippet">
  <figcaption><strong>${escapeHtml(label)}</strong>${meta ? ` <span class="ebook-snippet__meta">· ${escapeHtml(meta)}</span>` : ''}${description ? `<br /><span class="ebook-snippet__description">${escapeHtml(description)}</span>` : ''}</figcaption>
  <pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(source)}</code></pre>
</figure>`;
    } catch (_error) {
      output += match[0];
    }
  }

  output += input.slice(lastIndex);
  return output;
}

function usedGlossaryEntries(html, entries = glossaryEntries) {
  const keys = new Set();
  const pattern = /<abbr\b[^>]*\bdata-glossary-key="([^"]+)"[^>]*>[\s\S]*?<\/abbr>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    keys.add(decodeHtmlAttribute(match[1]).trim());
  }

  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return [...keys]
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key, 'de', { sensitivity: 'base' }));
}

function rewriteGlossaryLinks(html) {
  return String(html || '').replace(
    /<abbr\b[^>]*\bdata-glossary-key="([^"]+)"[^>]*>([\s\S]*?)<\/abbr>/gi,
    (_match, rawKey, label) => {
      const key = decodeHtmlAttribute(rawKey).trim();
      const anchor = `glossary-${glossarySlug(key)}`;
      return `<a class="ebook-glossary-term" href="glossary.xhtml#${escapeHtml(anchor)}">${label}</a>`;
    }
  );
}

function buildGlossaryHtml(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  const rows = entries.map((entry) => {
    const title = entry.full && entry.full !== entry.key
      ? `${entry.key} — ${entry.full}`
      : entry.key;
    const description = entry.description || entry.short || '';
    return `<div class="ebook-glossary-entry" id="glossary-${escapeHtml(glossarySlug(entry.key))}">
  <dt>${escapeHtml(title)}</dt>
  <dd>${escapeHtml(description)}</dd>
</div>`;
  }).join('\n');

  return `<section class="ebook-glossary">
  <h1>Glossar</h1>
  <p>Die folgenden Begriffe werden in diesem Artikel verwendet. Alle Einträge sind Teil dieser Datei und funktionieren damit auch offline.</p>
  <dl>${rows}</dl>
</section>`;
}

function splitArticleSections(html, fallbackTitle = 'Artikel') {
  const source = String(html || '');
  const headingPattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  const matches = [...source.matchAll(headingPattern)];

  if (!matches.length) {
    return [{ title: fallbackTitle, html: source }];
  }

  const sections = [];
  const intro = source.slice(0, matches[0].index).trim();
  if (intro) sections.push({ title: fallbackTitle, html: intro });

  matches.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const title = stripHtml(match[1]) || `Abschnitt ${index + 1}`;
    sections.push({
      title,
      html: source.slice(start, end).trim()
    });
  });

  return sections;
}

function fileNameForSection(title, index) {
  const slug = String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `section-${String(index + 1).padStart(2, '0')}-${slug || 'article'}.xhtml`;
}

async function loadAuthorProfile(assetRoot) {
  const file = path.resolve(assetRoot, 'config', 'author.json');
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function buildAuthorHtml(profile, photoSrc = '') {
  if (!profile) return '';
  const bio = Array.isArray(profile.bio) ? profile.bio : [profile.bio].filter(Boolean);
  const focus = Array.isArray(profile.focus) ? profile.focus : [];

  return `<section class="ebook-author">
  <h1>Über den Autor</h1>
  ${photoSrc ? `<img class="ebook-author__photo" src="${escapeHtml(photoSrc)}" alt="Profilfoto von ${escapeHtml(profile.name || 'Autor')}" />` : ''}
  <h2>${escapeHtml(profile.name || 'Ivan Babayev')}</h2>
  ${profile.role ? `<p class="ebook-author__role">${escapeHtml(profile.role)}</p>` : ''}
  ${bio.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
  ${profile.experience ? `<p><strong>Erfahrung:</strong> ${escapeHtml(profile.experience)}</p>` : ''}
  ${focus.length ? `<p><strong>Schwerpunkte:</strong> ${focus.map(escapeHtml).join(' · ')}</p>` : ''}
  ${profile.website ? `<p><strong>Web:</strong> <a href="${escapeHtml(profile.website)}">${escapeHtml(profile.website)}</a></p>` : ''}
  ${profile.linkedin ? `<p><strong>LinkedIn:</strong> <a href="${escapeHtml(profile.linkedin)}">${escapeHtml(profile.linkedin)}</a></p>` : ''}
</section>`;
}

async function buildPublicationContent(post, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const withSnippets = await expandSnippetLinks(post.html, assetRoot);
  const glossary = usedGlossaryEntries(withSnippets);
  const articleHtml = rewriteGlossaryLinks(withSnippets);
  const sections = splitArticleSections(articleHtml, 'Einleitung')
    .map((section, index) => ({
      ...section,
      filename: fileNameForSection(section.title, index)
    }));

  const authorProfile = await loadAuthorProfile(assetRoot);
  return {
    articleHtml,
    sections,
    glossary,
    glossaryHtml: buildGlossaryHtml(glossary),
    authorProfile
  };
}

module.exports = {
  buildAuthorHtml,
  buildGlossaryHtml,
  buildPublicationContent,
  decodeHtmlAttribute,
  escapeHtml,
  expandSnippetLinks,
  fileNameForSection,
  loadAuthorProfile,
  rewriteGlossaryLinks,
  safeSnippetPath,
  sliceSnippet,
  snippetRange,
  splitArticleSections,
  stripHtml,
  usedGlossaryEntries
};
