const glossary = require('../config/glossary.json');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function glossarySlug(value) {
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

function normalizeEntry(key, value) {
  const entry = value && typeof value === 'object' ? value : {};
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((alias) => String(alias).trim()).filter(Boolean)
    : [];

  return {
    key: String(key).trim(),
    full: String(entry.full || key).trim(),
    short: String(entry.short || '').trim(),
    description: String(entry.description || entry.short || '').trim(),
    aliases
  };
}

const glossaryEntries = Object.entries(glossary)
  .map(([key, value]) => normalizeEntry(key, value))
  .filter((entry) => entry.key)
  .sort((left, right) => left.key.localeCompare(right.key, 'de', { sensitivity: 'base' }));

const labelToKey = new Map();
for (const entry of glossaryEntries) {
  labelToKey.set(entry.key, entry.key);
  for (const alias of entry.aliases) {
    if (!labelToKey.has(alias)) {
      labelToKey.set(alias, entry.key);
    }
  }
}

function canonicalGlossaryKey(label) {
  return labelToKey.get(String(label || '').trim()) || null;
}

function glossaryTitle(entry) {
  const parts = [];
  if (entry.full && entry.full !== entry.key) {
    parts.push(entry.full);
  }
  if (entry.short) {
    parts.push(entry.short);
  }
  return parts.join(' — ') || entry.description || entry.key;
}

function glossaryDefinitions(entries = glossaryEntries) {
  return entries
    .flatMap((entry) => [entry.key, ...entry.aliases]
      .map((label) => `*[${label}]: ${glossaryTitle(entry)}`))
    .join('\n');
}

function withGlossaryDefinitions(markdown) {
  const definitions = glossaryDefinitions();
  if (!definitions) {
    return String(markdown || '');
  }
  return `${definitions}\n\n${String(markdown || '')}`;
}

function groupGlossaryEntries(entries = glossaryEntries) {
  const groups = new Map();
  for (const entry of entries) {
    const letter = (entry.key[0] || '#').toLocaleUpperCase('de');
    if (!groups.has(letter)) {
      groups.set(letter, []);
    }
    groups.get(letter).push(entry);
  }
  return groups;
}

function renderGlossaryPage() {
  const groups = groupGlossaryEntries();
  const indexLinks = [...groups.keys()]
    .map((letter) => `<a href="#letter-${encodeURIComponent(letter)}">${escapeHtml(letter)}</a>`)
    .join(' ');

  const sections = [...groups.entries()]
    .map(([letter, entries]) => {
      const cards = entries.map((entry) => {
        const aliases = entry.aliases.length
          ? `<p class="glossary-aliases"><span>Auch:</span> ${entry.aliases.map(escapeHtml).join(', ')}</p>`
          : '';
        const expanded = entry.full && entry.full !== entry.key
          ? `<p class="glossary-full">${escapeHtml(entry.full)}</p>`
          : '';

        return `<article class="glossary-card" id="${escapeHtml(glossarySlug(entry.key))}">
          <h3>${escapeHtml(entry.key)}</h3>
          ${expanded}
          <p class="glossary-short">${escapeHtml(entry.short)}</p>
          <p>${escapeHtml(entry.description)}</p>
          ${aliases}
        </article>`;
      }).join('\n');

      return `<section class="glossary-section" aria-labelledby="letter-${escapeHtml(letter)}">
        <h2 id="letter-${escapeHtml(letter)}">${escapeHtml(letter)}</h2>
        <div class="glossary-grid">${cards}</div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Glossar mit Fachbegriffen und Abkürzungen aus Kernel Notes." />
  <title>Glossar · Kernel Notes</title>
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/assets/css/glossary.css" />
</head>
<body class="post-page glossary-page">
  <header class="site-header">
    <a class="brand" href="/">Kernel Notes</a>
    <nav class="main-nav" aria-label="Hauptnavigation">
      <a href="/">Artikel</a>
      <a href="/#topics">Themen</a>
      <a href="/snippets/">Snippets</a>
      <a href="/roadmap">Roadmap</a>
      <a href="/glossary" aria-current="page">Glossar</a>
      <a href="/about">About</a>
      <a href="/impressum">Impressum</a>
    </nav>
  </header>
  <main class="terminal-post glossary-main">
    <p class="meta">Fachbegriffe &amp; Fremdwörter</p>
    <h1>Glossar</h1>
    <p class="glossary-intro">Kurze Erklärungen für Begriffe, die in den Artikeln vorkommen. Die gleichen Definitionen werden auch für die Hinweise direkt im Text verwendet.</p>
    <nav class="glossary-index" aria-label="Glossar alphabetisch">${indexLinks}</nav>
    ${sections}
  </main>
  <script src="/assets/tag-navigation.js" defer></script>
</body>
</html>`;
}

module.exports = {
  canonicalGlossaryKey,
  glossaryDefinitions,
  glossaryEntries,
  glossarySlug,
  glossaryTitle,
  groupGlossaryEntries,
  renderGlossaryPage,
  withGlossaryDefinitions
};
