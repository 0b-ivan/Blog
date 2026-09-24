const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { File } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const {
  buildAuthorHtml,
  buildPublicationContent
} = require('./publication-content');
const {
  resolveCoverSubtitle,
  resolveCoverTitle
} = require('./cover-metadata');

const DEFAULT_AUTHOR = 'Ivan Babayev';
const DEFAULT_PUBLISHER = 'Kernel Notes';
const DEFAULT_LANGUAGE = 'de-DE';

const EBOOK_CSS = `
body {
  color: #17202a;
  font-family: serif;
  font-size: 1em;
  line-height: 1.58;
  margin: 5%;
}
h1, h2, h3, h4 {
  color: #0b3f38;
  font-family: sans-serif;
  line-height: 1.18;
  page-break-after: avoid;
}
h1 { font-size: 2em; margin: 1.8em 0 0.8em; }
h2 { font-size: 1.45em; margin: 1.6em 0 0.65em; }
h3 { font-size: 1.15em; margin: 1.35em 0 0.55em; }
p, li { orphans: 3; widows: 3; }
a { color: #005f52; }
pre {
  background: #101820;
  color: #f5f5f0;
  font-family: monospace;
  font-size: 0.82em;
  line-height: 1.45;
  padding: 1em;
  white-space: pre-wrap;
}
code { font-family: monospace; }
blockquote {
  border-left: 0.25em solid #8ab8ad;
  color: #4f5b62;
  margin-left: 0;
  padding-left: 1em;
}
img, svg {
  display: block;
  height: auto;
  margin: 1.2em auto;
  max-width: 100%;
}
.book-title-page {
  margin-top: 18%;
  text-align: center;
}
.book-kicker {
  color: #006b5d;
  font-family: sans-serif;
  font-size: 0.82em;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.book-title-page h1 {
  color: #111820;
  font-size: 2.35em;
  margin: 0.65em 0 0.45em;
}
.book-subtitle {
  color: #59646b;
  font-size: 1.02em;
  margin: 0 auto 2em;
  max-width: 34em;
}
.book-author {
  color: #0b3f38;
  font-family: sans-serif;
  font-size: 1.15em;
  font-weight: bold;
}
.book-meta {
  color: #69737a;
  font-size: 0.86em;
  margin-top: 3em;
}
.book-deckblatt {
  margin: 0;
  padding: 0;
  text-align: center;
}
.book-deckblatt img {
  margin: 0 auto;
  max-height: 98vh;
  max-width: 100%;
}
.ebook-snippet {
  margin: 1.4em 0;
}
.ebook-snippet figcaption {
  color: #445159;
  font-family: sans-serif;
  font-size: 0.82em;
  margin-bottom: 0.45em;
}
.ebook-snippet__meta,
.ebook-snippet__description {
  color: #68737a;
}
.ebook-glossary-term {
  border-bottom: 1px dotted #4d7f76;
  color: inherit;
  text-decoration: none;
}
.ebook-glossary dl {
  margin: 0;
}
.ebook-glossary-entry {
  margin: 0 0 1em;
}
.ebook-glossary dt {
  color: #0b3f38;
  font-family: sans-serif;
  font-weight: bold;
}
.ebook-glossary dd {
  margin: 0.25em 0 0;
}
.ebook-source-ref sup {
  font-size: 0.72em;
  margin-left: 0.15em;
}
.ebook-source-entry {
  margin: 0 0 0.9em;
  padding-left: 2.4em;
  text-indent: -2.4em;
}
.ebook-source-number {
  font-family: monospace;
  font-weight: bold;
}
.ebook-author__photo {
  border-radius: 50%;
  max-width: 10em;
}
.ebook-author__role {
  color: #59646b;
  font-family: sans-serif;
  font-weight: bold;
}
.book-colophon {
  border-top: 1px solid #d9ddd8;
  margin-top: 2em;
  padding-top: 1em;
}
`;

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function displayAuthor(value) {
  const raw = String(value || '').trim();
  if (!raw || ['obivan', '0b-ivan'].includes(raw.toLowerCase())) {
    return DEFAULT_AUTHOR;
  }
  return raw;
}

function displayDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || '');
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(parsed);
}

function coverAccent(category) {
  const palette = ['#006b5d', '#145a78', '#7a4f01', '#7b3f67', '#3f6b2a', '#6f4b2f'];
  const text = String(category || 'IT');
  let hash = 0;
  for (const character of text) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function wrapCoverTitle(title, maxChars = 22, maxLines = 6) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }

    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].replace(/[.…]+$/, '')} …`;
  }

  return lines;
}

function wrapCoverText(value, maxChars, maxLines) {
  return wrapCoverTitle(value, maxChars, maxLines);
}

function buildEditorialCoverSvg(post, imageDataUri = '') {
  const author = displayAuthor(post.author);
  const title = resolveCoverTitle(post);
  const subtitle = resolveCoverSubtitle(post, { maxLength: 150 });
  const titleLines = wrapCoverText(title, 24, 4);
  const subtitleLines = wrapCoverText(subtitle, 42, 3);
  const titleSize = titleLines.length >= 4 ? 112 : titleLines.length === 3 ? 124 : 136;
  const titleStartY = 610;
  const titleLeading = titleSize * 1.08;
  const subtitleStartY = titleStartY + (titleLines.length * titleLeading) + 82;
  const tags = (Array.isArray(post.tags) ? post.tags : [])
    .slice(0, 5)
    .map((tag) => String(tag || '').replace(/-/g, ' ').toUpperCase())
    .filter(Boolean);
  const imageMarkup = imageDataUri
    ? `<image href="${imageDataUri}" x="470" y="1270" width="1130" height="1290" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <clipPath id="imageClip">
      <path d="M470 1680 C760 1500 1050 1350 1600 1250 L1600 2560 L470 2560 Z"/>
    </clipPath>
    <linearGradient id="imageFade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="2560" fill="#ffffff"/>
  <text x="140" y="175" class="brand">KERNEL NOTES</text>
  <line x1="650" y1="158" x2="1260" y2="158" stroke="#aeb5bc" stroke-width="3"/>
  <text x="1460" y="142" text-anchor="end" class="edition">BLOG</text>
  <text x="1460" y="187" text-anchor="end" class="edition">EDITION</text>
  <line x1="1385" y1="218" x2="1460" y2="218" stroke="#e83224" stroke-width="6"/>

  <text x="140" y="430" class="category">${escapeXml(String(post.category || 'IT').toUpperCase())}</text>

  ${titleLines.map((line, index) => `<text x="140" y="${titleStartY + index * titleLeading}" class="title" style="font-size:${titleSize}px">${escapeXml(line)}</text>`).join('\n')}

  ${subtitleLines.map((line, index) => `<text x="140" y="${subtitleStartY + index * 70}" class="subtitle">${escapeXml(line)}</text>`).join('\n')}

  <line x1="140" y1="1310" x2="300" y2="1310" stroke="#f04a28" stroke-width="10"/>
  ${tags.map((tag, index) => `<text x="140" y="${1390 + index * 62}" class="topic">${escapeXml(tag)}</text>`).join('\n')}

  ${imageMarkup}
  ${imageDataUri ? '<path d="M0 1735 C310 1840 500 1700 720 1585 C980 1450 1240 1365 1600 1305" fill="none" stroke="#55bed0" stroke-width="2" opacity="0.68"/><path d="M0 1770 C310 1875 510 1735 730 1620 C990 1485 1250 1400 1600 1340" fill="none" stroke="#55bed0" stroke-width="2" opacity="0.52"/><path d="M0 1805 C310 1910 520 1770 740 1655 C1000 1520 1260 1435 1600 1375" fill="none" stroke="#55bed0" stroke-width="2" opacity="0.36"/>' : ''}

  <rect x="0" y="2110" width="650" height="450" fill="#ffffff" fill-opacity="0.94"/>
  <text x="140" y="2260" class="author">${escapeXml(author)}</text>
  <text x="140" y="2345" class="meta">BLOG.OBIVAN.ORG</text>
  <text x="140" y="2420" class="meta">${escapeXml(displayDate(post.date).toUpperCase())}</text>

  <style>
    .brand { font-family: "Courier New", "Liberation Mono", monospace; font-size: 64px; font-weight: 700; letter-spacing: 9px; fill: #e83224; }
    .edition { font-family: sans-serif; font-size: 34px; letter-spacing: 8px; fill: #1a1f24; }
    .category { font-family: sans-serif; font-size: 52px; font-weight: 800; letter-spacing: 3px; fill: #e83224; }
    .title { font-family: "TeX Gyre Heros", Arial, sans-serif; font-weight: 800; fill: #080a0b; }
    .subtitle { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 48px; fill: #66727d; }
    .topic { font-family: "Courier New", "Liberation Mono", monospace; font-size: 34px; letter-spacing: 5px; fill: #2d343a; }
    .author { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 58px; font-weight: 800; fill: #080a0b; }
    .meta { font-family: "Courier New", "Liberation Mono", monospace; font-size: 30px; letter-spacing: 5px; fill: #59646b; }
  </style>
</svg>`;
}

function buildCoverSvg(post) {
  return buildEditorialCoverSvg(post);
}

function normalizeSiteUrl(value) {
  return String(value || 'https://blog.obivan.org').replace(/\/+$/, '');
}

function normalizeEpubDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return undefined;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function localAssetUrl(src, assetRoot) {
  if (!String(src || '').startsWith('/assets/')) return '';
  const assetsRoot = path.resolve(assetRoot, 'assets');
  const requested = path.resolve(assetRoot, String(src).replace(/^\//, ''));
  if (requested !== assetsRoot && !requested.startsWith(`${assetsRoot}${path.sep}`)) {
    return '';
  }
  return pathToFileURL(requested).href;
}

function prepareChapterHtml(html, { siteUrl, assetRoot }) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  return String(html || '')
    .replace(/\bsrc="([^"]+)"/g, (_match, src) => {
      if (src.startsWith('file://')) return `src="${src}"`;
      const localUrl = localAssetUrl(src, assetRoot);
      if (localUrl) return `src="${localUrl}"`;
      if (src.startsWith('/')) return `src="${normalizedSiteUrl}${src}"`;
      return `src="${src}"`;
    })
    .replace(/\bhref="\/([^"]*)"/g, (_match, href) => `href="${normalizedSiteUrl}/${href}"`);
}

function sourceUrlFor(post, siteUrl) {
  return `${normalizeSiteUrl(siteUrl)}/posts/${encodeURIComponent(post.slug)}`;
}

function buildTitlePage(post, siteUrl) {
  const author = displayAuthor(post.author);
  const sourceUrl = sourceUrlFor(post, siteUrl);
  const tags = Array.isArray(post.tags) ? post.tags.join(' · ') : '';

  return `<section class="book-title-page">
  <p class="book-kicker">Kernel Notes · ${escapeXml(post.category || 'IT')}</p>
  <h1>${escapeXml(post.title)}</h1>
  <p class="book-subtitle">${escapeXml(post.excerpt || '')}</p>
  <p class="book-author">${escapeXml(author)}</p>
  <p class="book-meta">
    Veröffentlicht: ${escapeXml(displayDate(post.date))}<br />
    ${tags ? `Themen: ${escapeXml(tags)}<br />` : ''}
    Lesezeit: ca. ${Number(post.readingTime) || 1} Min.<br />
    Quelle: <a href="${escapeXml(sourceUrl)}">${escapeXml(sourceUrl)}</a>
  </p>
</section>`;
}

function buildColophon(post, siteUrl) {
  const author = displayAuthor(post.author);
  const sourceUrl = sourceUrlFor(post, siteUrl);

  return `<section class="book-colophon">
  <h1>Über diese Ausgabe</h1>
  <p><strong>Titel:</strong> ${escapeXml(post.title)}</p>
  <p><strong>Autor:</strong> ${escapeXml(author)}</p>
  <p><strong>Herausgeber:</strong> Kernel Notes</p>
  <p><strong>Kategorie:</strong> ${escapeXml(post.category || 'IT')}</p>
  <p><strong>Veröffentlicht:</strong> ${escapeXml(displayDate(post.date))}</p>
  <p><strong>Quelle:</strong> <a href="${escapeXml(sourceUrl)}">${escapeXml(sourceUrl)}</a></p>
  <p>Diese digitale Ausgabe wurde aus dem veröffentlichten Kernel-Notes-Artikel erzeugt. EPUB und PDF verwenden dieselbe normalisierte Publikationsstruktur, werden aber formatspezifisch gerendert.</p>
</section>`;
}

function loadEpubDependencies() {
  const epubModule = require('epub-gen-memory');
  return {
    epub: epubModule.default || epubModule
  };
}

function coverMimeType(extension) {
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function buildPhotoCoverSvg(post, imageDataUri) {
  const author = displayAuthor(post.author);
  const coverTitle = resolveCoverTitle(post);
  const coverSubtitle = resolveCoverSubtitle(post, { maxLength: 120 });
  const lines = wrapCoverTitle(coverTitle, 24, 5);
  const firstY = 760 - ((lines.length - 1) * 76);
  const titleLines = lines
    .map((line, index) => `<text x="140" y="${firstY + index * 152}" class="title">${escapeXml(line)}</text>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07100f" stop-opacity="0.28"/>
      <stop offset="0.55" stop-color="#07100f" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#07100f" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <image href="${imageDataUri}" x="0" y="0" width="1600" height="2560" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1600" height="2560" fill="url(#shade)"/>
  <rect x="68" y="68" width="1464" height="2424" rx="50" fill="none" stroke="#ffffff" stroke-opacity="0.34" stroke-width="3"/>
  <text x="140" y="190" class="brand">KERNEL NOTES</text>
  <text x="140" y="470" class="category">${escapeXml(String(post.category || 'IT').toUpperCase())}</text>
  ${titleLines}
  ${coverSubtitle ? `<text x="140" y="1650" class="subtitle">${escapeXml(coverSubtitle)}</text>` : ''}
  <line x1="140" y1="1870" x2="1460" y2="1870" stroke="#7ce1d0" stroke-width="8"/>
  <text x="140" y="2040" class="author">${escapeXml(author)}</text>
  <text x="140" y="2160" class="meta">${escapeXml(displayDate(post.date))}</text>
  <text x="140" y="2320" class="source">blog.obivan.org</text>
  <style>
    .brand { font-family: monospace; font-size: 70px; font-weight: 700; letter-spacing: 8px; fill: #ffffff; }
    .category { font-family: sans-serif; font-size: 52px; font-weight: 700; letter-spacing: 8px; fill: #a9fff1; }
    .title { font-family: "Courier New", "Liberation Mono", Courier, monospace; font-size: 116px; font-weight: 700; letter-spacing: -2px; fill: #ffffff; stroke: #07100f; stroke-opacity: 0.28; stroke-width: 3px; paint-order: stroke fill; }
    .subtitle { font-family: sans-serif; font-size: 44px; fill: #d7e0de; }
    .author { font-family: sans-serif; font-size: 72px; font-weight: 700; fill: #ffffff; }
    .meta { font-family: monospace; font-size: 44px; fill: #d7e0de; }
    .source { font-family: monospace; font-size: 38px; fill: #d7e0de; letter-spacing: 2px; }
  </style>
</svg>`;
}

async function createEpubCover(post, assetRoot) {
  const coverImage = String(post.coverImage || '').trim();

  if (coverImage.startsWith('/assets/')) {
    const absolute = path.resolve(assetRoot, coverImage.replace(/^\//, ''));
    const assetsRoot = path.resolve(assetRoot, 'assets');

    if (absolute.startsWith(`${assetsRoot}${path.sep}`)) {
      try {
        const data = await fs.readFile(absolute);
        const extension = path.extname(absolute).toLowerCase() || '.jpg';
        const mimeType = coverMimeType(extension);
        if (mimeType !== 'image/svg+xml') {
          const imageDataUri = `data:${mimeType};base64,${data.toString('base64')}`;
          const svg = buildEditorialCoverSvg(post, imageDataUri);
          return new File(
            [Buffer.from(svg, 'utf8')],
            `${post.slug || 'kernel-notes'}-cover.svg`,
            { type: 'image/svg+xml' }
          );
        }
      } catch (_error) {
        // Fall through to the typographic cover when the article image is unavailable.
      }
    }
  }

  const coverSvg = buildEditorialCoverSvg(post);
  return new File(
    [Buffer.from(coverSvg, 'utf8')],
    `${post.slug || 'kernel-notes'}-cover.svg`,
    { type: 'image/svg+xml' }
  );
}

async function createDeckblatt(post, assetRoot, siteUrl) {
  const coverImage = String(post.coverImage || '').trim();
  if (!coverImage.startsWith('/assets/')) {
    return { html: buildTitlePage(post, siteUrl), cleanup: async () => {} };
  }

  const absolute = path.resolve(assetRoot, coverImage.replace(/^\//, ''));
  const assetsRoot = path.resolve(assetRoot, 'assets');
  if (absolute !== assetsRoot && !absolute.startsWith(`${assetsRoot}${path.sep}`)) {
    return { html: buildTitlePage(post, siteUrl), cleanup: async () => {} };
  }

  try {
    const data = await fs.readFile(absolute);
    const extension = path.extname(absolute).toLowerCase() || '.jpg';
    const mimeType = coverMimeType(extension);
    const dataUri = `data:${mimeType};base64,${data.toString('base64')}`;
    const svg = buildPhotoCoverSvg(post, dataUri);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-deckblatt-'));
    const tempFile = path.join(tempDir, 'deckblatt.svg');
    await fs.writeFile(tempFile, svg, 'utf8');

    return {
      html: `<div class="book-deckblatt"><img src="${pathToFileURL(tempFile).href}" alt="Deckblatt: ${escapeXml(post.title)}" /></div>`,
      cleanup: () => fs.rm(tempDir, { recursive: true, force: true })
    };
  } catch (_error) {
    return { html: buildTitlePage(post, siteUrl), cleanup: async () => {} };
  }
}

function ensureCoverImageProperty(opf) {
  return String(opf || '').replace(
    /<item\s+([^>]*\bid="image_cover"[^>]*)\/>/i,
    (_match, rawAttributes) => {
      let attributes = rawAttributes.trim();
      const propertiesMatch = attributes.match(/\bproperties="([^"]*)"/i);

      if (propertiesMatch) {
        const properties = propertiesMatch[1].split(/\s+/).filter(Boolean);
        if (!properties.includes('cover-image')) properties.push('cover-image');
        attributes = attributes.replace(
          propertiesMatch[0],
          `properties="${properties.join(' ')}"`
        );
      } else {
        attributes = `${attributes} properties="cover-image"`;
      }

      return `<item ${attributes} />`;
    }
  );
}

async function ensureEpubCoverMetadata(epubBuffer) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(epubBuffer);
  const packageEntry = zip.file('OEBPS/content.opf');
  if (!packageEntry) return epubBuffer;

  const opf = await packageEntry.async('string');
  const patched = ensureCoverImageProperty(opf);
  if (patched === opf) return epubBuffer;

  zip.file('OEBPS/content.opf', patched);
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  return zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
}

async function buildArticleEpub(post, options = {}) {
  const { epub } = loadEpubDependencies();
  const siteUrl = normalizeSiteUrl(options.siteUrl);
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const author = displayAuthor(post.author);
  const cover = await createEpubCover(post, assetRoot);
  const publication = await buildPublicationContent(post, { assetRoot });
  const deckblatt = await createDeckblatt(post, assetRoot, siteUrl);

  const chapters = [
    {
      title: 'Deckblatt',
      filename: 'deckblatt.xhtml',
      beforeToc: true,
      excludeFromToc: true,
      content: deckblatt.html
    },
    ...publication.sections.map((section) => ({
      title: section.title,
      filename: section.filename,
      content: `<article>${prepareChapterHtml(section.html, { siteUrl, assetRoot })}</article>`
    }))
  ];

  if (publication.glossaryHtml) {
    chapters.push({
      title: 'Glossar',
      filename: 'glossary.xhtml',
      content: prepareChapterHtml(publication.glossaryHtml, { siteUrl, assetRoot })
    });
  }

  if (publication.sourcesHtml) {
    chapters.push({
      title: 'Literatur- und Quellenverzeichnis',
      filename: 'sources.xhtml',
      content: prepareChapterHtml(publication.sourcesHtml, { siteUrl, assetRoot })
    });
  }

  if (publication.authorProfile) {
    const photo = localAssetUrl(publication.authorProfile.photo || '', assetRoot);
    chapters.push({
      title: 'Über den Autor',
      filename: 'author.xhtml',
      content: buildAuthorHtml(publication.authorProfile, photo)
    });
  }

  chapters.push({
    title: 'Über diese Ausgabe',
    filename: 'colophon.xhtml',
    excludeFromToc: true,
    content: buildColophon(post, siteUrl)
  });

  try {
    const generatedEpub = await epub({
      title: post.title,
      author,
      publisher: DEFAULT_PUBLISHER,
      description: post.excerpt || '',
      cover,
      tocTitle: 'Inhalt',
      tocInTOC: true,
      numberChaptersInTOC: false,
      prependChapterTitles: false,
      date: normalizeEpubDate(post.date),
      lang: DEFAULT_LANGUAGE,
      css: EBOOK_CSS,
      version: 3,
      ignoreFailedDownloads: false
    }, chapters);

    return ensureEpubCoverMetadata(generatedEpub);
  } finally {
    await deckblatt.cleanup();
  }
}

async function buildArticlePdf(post, options = {}) {
  const base = String(
    options.pdfServiceUrl
      || process.env.PDF_SERVICE_URL
      || 'http://pdf:8092'
  ).replace(/\/+$/, '');
  const url = `${base}/pdf/${encodeURIComponent(post.slug)}`;
  const response = await globalThis.fetch(url, {
    headers: { Accept: 'application/pdf' },
    signal: globalThis.AbortSignal.timeout(Number(options.pdfTimeoutMs) || 45000)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`LaTeX PDF renderer failed with HTTP ${response.status}${message ? `: ${message.slice(0, 200)}` : ''}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  EBOOK_CSS,
  buildArticleEpub,
  buildArticlePdf,
  buildColophon,
  buildCoverSvg,
  buildEditorialCoverSvg,
  buildPhotoCoverSvg,
  createDeckblatt,
  createEpubCover,
  displayAuthor,
  ensureCoverImageProperty,
  localAssetUrl,
  normalizeEpubDate,
  prepareChapterHtml,
  wrapCoverTitle
};
