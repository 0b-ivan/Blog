const path = require('node:path');
const { File } = require('node:buffer');
const { pathToFileURL } = require('node:url');

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
code {
  font-family: monospace;
}
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

function decodeXml(value) {
  return String(value || '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&#x00A9;|&#169;/gi, '©')
    .replace(/&amp;/g, '&');
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

function isChaosMonkeyPost(post) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const haystack = [
    post.title,
    post.slug,
    ...tags
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /chaos[-\s]+monkey/.test(haystack)
    || (haystack.includes('chaos') && haystack.includes('monkey'));
}

function buildChaosMonkeyMotif(post, options = {}) {
  if (!isChaosMonkeyPost(post)) return '';

  const x = Number(options.x) || 1040;
  const y = Number(options.y) || 1500;
  const stroke = escapeXml(options.stroke || '#a9fff1');
  const opacity = Number.isFinite(options.opacity) ? options.opacity : 0.24;

  return `<g class="cover-monkey" transform="translate(${x} ${y})" fill="none" stroke="${stroke}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">
    <circle cx="92" cy="166" r="72"/>
    <circle cx="408" cy="166" r="72"/>
    <path d="M142 148C150 54 216 12 250 12s100 42 108 136c58 42 76 120 52 192-24 74-88 128-160 128S114 414 90 340c-24-72-6-150 52-192Z"/>
    <ellipse cx="250" cy="284" rx="118" ry="94"/>
    <circle cx="208" cy="206" r="13" fill="${stroke}" stroke="none"/>
    <circle cx="292" cy="206" r="13" fill="${stroke}" stroke="none"/>
    <path d="M214 326c22 18 50 18 72 0"/>
    <path d="M250 248v34"/>
  </g>`;
}

function buildCoverSvg(post) {
  const author = displayAuthor(post.author);
  const accent = coverAccent(post.category);
  const lines = wrapCoverTitle(post.title);
  const firstY = 860 - ((lines.length - 1) * 82);
  const titleLines = lines
    .map((line, index) => `<text x="150" y="${firstY + index * 164}" class="title">${escapeXml(line)}</text>`)
    .join('\n');
  const motif = buildChaosMonkeyMotif(post, {
    x: 1010,
    y: 1510,
    stroke: accent,
    opacity: 0.18
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <rect width="1600" height="2560" fill="#f5f2e9"/>
  <rect x="64" y="64" width="1472" height="2432" rx="56" fill="#101820"/>
  <rect x="112" y="112" width="1376" height="2336" rx="38" fill="#f7f5ee"/>
  <rect x="112" y="112" width="28" height="2336" fill="${accent}"/>
  <circle cx="192" cy="202" r="18" fill="#ff6b6b"/>
  <circle cx="246" cy="202" r="18" fill="#f7c948"/>
  <circle cx="300" cy="202" r="18" fill="#5cc689"/>
  <text x="358" y="220" class="brand">KERNEL NOTES</text>
  <text x="150" y="520" class="category">${escapeXml(String(post.category || 'IT').toUpperCase())}</text>
  ${titleLines}
  ${motif}
  <line x1="150" y1="1830" x2="1450" y2="1830" stroke="${accent}" stroke-width="8"/>
  <text x="150" y="1990" class="author">${escapeXml(author)}</text>
  <text x="150" y="2115" class="meta">${escapeXml(displayDate(post.date))}</text>
  <text x="150" y="2250" class="source">blog.obivan.org</text>
  <text x="1450" y="2250" class="edition" text-anchor="end">DIGITAL EDITION</text>
  <style>
    .brand { font-family: monospace; font-size: 70px; font-weight: 700; letter-spacing: 8px; fill: #111820; }
    .category { font-family: sans-serif; font-size: 54px; font-weight: 700; letter-spacing: 8px; fill: ${accent}; }
    .title { font-family: "Courier New", "Liberation Mono", Courier, monospace; font-size: 120px; font-weight: 700; letter-spacing: -2px; fill: #111820; }
    .author { font-family: sans-serif; font-size: 72px; font-weight: 700; fill: #111820; }
    .meta { font-family: monospace; font-size: 44px; fill: #657078; }
    .source, .edition { font-family: monospace; font-size: 38px; fill: #657078; letter-spacing: 2px; }
  </style>
</svg>`;
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
  if (!src.startsWith('/assets/')) return '';
  const assetsRoot = path.resolve(assetRoot, 'assets');
  const requested = path.resolve(assetRoot, src.replace(/^\//, ''));
  if (requested !== assetsRoot && !requested.startsWith(`${assetsRoot}${path.sep}`)) {
    return '';
  }
  return pathToFileURL(requested).href;
}

function prepareChapterHtml(html, { siteUrl, assetRoot }) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  return String(html || '')
    .replace(/\bsrc="([^"]+)"/g, (_match, src) => {
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
  <p>Diese digitale Ausgabe wurde direkt aus dem veröffentlichten Kernel-Notes-Artikel erzeugt. Der PDF-Download wird aus genau diesem EPUB abgeleitet.</p>
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
  const lines = wrapCoverTitle(post.title);
  const firstY = 760 - ((lines.length - 1) * 76);
  const titleLines = lines
    .map((line, index) => `<text x="140" y="${firstY + index * 152}" class="title">${escapeXml(line)}</text>`)
    .join('\n');
  const motif = buildChaosMonkeyMotif(post, {
    x: 1010,
    y: 1510,
    stroke: '#a9fff1',
    opacity: 0.32
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07100f" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#07100f" stop-opacity="0.52"/>
      <stop offset="1" stop-color="#07100f" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <image href="${imageDataUri}" x="0" y="0" width="1600" height="2560" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1600" height="2560" fill="url(#shade)"/>
  <rect x="68" y="68" width="1464" height="2424" rx="50" fill="none" stroke="#ffffff" stroke-opacity="0.36" stroke-width="3"/>
  <circle cx="156" cy="164" r="18" fill="#ff6b6b"/>
  <circle cx="212" cy="164" r="18" fill="#f7c948"/>
  <circle cx="268" cy="164" r="18" fill="#5cc689"/>
  <text x="338" y="184" class="brand">KERNEL NOTES</text>
  <text x="140" y="470" class="category">${escapeXml(String(post.category || 'IT').toUpperCase())}</text>
  ${titleLines}
  ${motif}
  <line x1="140" y1="1870" x2="1460" y2="1870" stroke="#7ce1d0" stroke-width="8"/>
  <text x="140" y="2040" class="author">${escapeXml(author)}</text>
  <text x="140" y="2160" class="meta">${escapeXml(displayDate(post.date))}</text>
  <text x="140" y="2320" class="source">blog.obivan.org</text>
  <style>
    .brand { font-family: monospace; font-size: 70px; font-weight: 700; letter-spacing: 8px; fill: #ffffff; }
    .category { font-family: sans-serif; font-size: 52px; font-weight: 700; letter-spacing: 8px; fill: #a9fff1; }
    .title { font-family: "Courier New", "Liberation Mono", Courier, monospace; font-size: 116px; font-weight: 700; letter-spacing: -2px; fill: #ffffff; stroke: #07100f; stroke-opacity: 0.28; stroke-width: 3px; paint-order: stroke fill; }
    .author { font-family: sans-serif; font-size: 72px; font-weight: 700; fill: #ffffff; }
    .meta { font-family: monospace; font-size: 44px; fill: #d7e0de; }
    .source { font-family: monospace; font-size: 38px; fill: #d7e0de; letter-spacing: 2px; }
  </style>
</svg>`;
}

async function createEpubCover(post, assetRoot) {
  const coverImage = String(post.coverImage || '').trim();
  if (coverImage.startsWith('/assets/covers/')) {
    const absolute = path.resolve(assetRoot, coverImage.replace(/^\//, ''));
    const coversRoot = path.resolve(assetRoot, 'assets', 'covers');
    if (absolute.startsWith(`${coversRoot}${path.sep}`)) {
      try {
        const data = await require('node:fs/promises').readFile(absolute);
        const extension = path.extname(absolute).toLowerCase() || '.jpg';
        const mimeType = coverMimeType(extension);
        if (mimeType !== 'image/svg+xml') {
          const imageDataUri = `data:${mimeType};base64,${data.toString('base64')}`;
          const photoCoverSvg = buildPhotoCoverSvg(post, imageDataUri);
          return new File(
            [Buffer.from(photoCoverSvg, 'utf8')],
            `${post.slug || 'kernel-notes'}-cover.svg`,
            { type: 'image/svg+xml' }
          );
        }

        return new File(
          [data],
          `${post.slug || 'kernel-notes'}-cover.svg`,
          { type: 'image/svg+xml' }
        );
      } catch (_error) {
        // Fall back to the generated Kernel Notes cover.
      }
    }
  }

  const coverSvg = buildCoverSvg(post);
  return new File(
    [Buffer.from(coverSvg, 'utf8')],
    `${post.slug || 'kernel-notes'}-cover.svg`,
    { type: 'image/svg+xml' }
  );
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

  const articleHtml = prepareChapterHtml(post.html, { siteUrl, assetRoot });

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
    ignoreFailedDownloads: true
  }, [
    {
      title: 'Titelseite',
      filename: 'title.xhtml',
      beforeToc: true,
      excludeFromToc: true,
      content: buildTitlePage(post, siteUrl)
    },
    {
      title: post.title,
      filename: 'article.xhtml',
      content: `<article>${articleHtml}</article>`
    },
    {
      title: 'Über diese Ausgabe',
      filename: 'colophon.xhtml',
      content: buildColophon(post, siteUrl)
    }
  ]);

  return ensureEpubCoverMetadata(generatedEpub);
}

function parseAttributes(fragment) {
  const attributes = {};
  const pattern = /([:\w-]+)="([^"]*)"/g;
  for (const match of fragment.matchAll(pattern)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function parsePackage(opf) {
  const manifest = new Map();
  const itemPattern = /<item\s+([^>]+?)\s*\/?>/g;
  for (const match of opf.matchAll(itemPattern)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.id && attributes.href) {
      manifest.set(attributes.id, attributes);
    }
  }

  const spine = [];
  const spinePattern = /<itemref\s+([^>]+?)\s*\/?>/g;
  for (const match of opf.matchAll(spinePattern)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.idref) spine.push(attributes.idref);
  }

  const metadata = {
    title: decodeXml(opf.match(/<dc:title>([\s\S]*?)<\/dc:title>/)?.[1] || ''),
    author: decodeXml(opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/)?.[1] || ''),
    description: decodeXml(opf.match(/<dc:description>([\s\S]*?)<\/dc:description>/)?.[1] || ''),
    publisher: decodeXml(opf.match(/<dc:publisher>([\s\S]*?)<\/dc:publisher>/)?.[1] || ''),
    date: decodeXml(opf.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1] || '')
  };

  return { manifest, spine, metadata };
}

function textContent(node) {
  if (!node) return '';
  if (node.type === 'text') return node.data || '';
  return (node.children || []).map(textContent).join('');
}

function normalizeText(value) {
  return String(value || '').replace(/[\t\r\n ]+/g, ' ').trim();
}

function ensureRoom(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
  }
}

function renderParagraph(doc, text, options = {}) {
  const clean = normalizeText(text);
  if (!clean) return;
  const font = options.font || 'Helvetica';
  const size = options.size || 10.5;
  const color = options.color || '#253038';
  const lineGap = options.lineGap ?? 3;
  const indent = options.indent || 0;
  const available = doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;
  doc.font(font).fontSize(size).fillColor(color);
  const height = doc.heightOfString(clean, { width: available, lineGap });
  ensureRoom(doc, Math.min(height + 16, doc.page.height * 0.65));
  doc.text(clean, doc.page.margins.left + indent, doc.y, {
    width: available,
    lineGap,
    align: options.align || 'left'
  });
  doc.moveDown(options.moveDown ?? 0.65);
}

function renderHeading(doc, text, level) {
  const clean = normalizeText(text);
  if (!clean) return;
  const sizes = { 1: 21, 2: 16, 3: 13, 4: 11.5 };
  const size = sizes[level] || 11.5;
  ensureRoom(doc, size * 2.6);
  doc.font('Helvetica-Bold').fontSize(size).fillColor('#0b4f45');
  doc.text(clean, { lineGap: 2 });
  doc.moveDown(level === 1 ? 0.8 : 0.55);
}

function renderCode(doc, text) {
  const clean = String(text || '').replace(/^\n+|\n+$/g, '');
  if (!clean) return;

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Courier').fontSize(8.4);
  const height = doc.heightOfString(clean, { width: width - 18, lineGap: 2 }) + 18;
  ensureRoom(doc, Math.min(height + 12, doc.page.height * 0.7));
  const startY = doc.y;
  doc.save()
    .roundedRect(doc.page.margins.left, startY, width, Math.min(height, doc.page.height * 0.62), 5)
    .fill('#111820')
    .restore();
  doc.fillColor('#f5f5f0').text(clean, doc.page.margins.left + 9, startY + 9, {
    width: width - 18,
    lineGap: 2
  });
  doc.y = Math.max(doc.y, startY + Math.min(height, doc.page.height * 0.62));
  doc.moveDown(0.8);
}

function epubEntryPath(chapterHref, assetHref) {
  const chapterDir = path.posix.dirname(chapterHref);
  return path.posix.normalize(path.posix.join('OEBPS', chapterDir, assetHref));
}

function svgSize(svg) {
  const viewBox = String(svg || '').match(/viewBox="[^"]*?([\d.]+)\s+([\d.]+)"/i);
  if (viewBox) {
    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  const width = Number(String(svg || '').match(/\bwidth="([\d.]+)"/i)?.[1]);
  const height = Number(String(svg || '').match(/\bheight="([\d.]+)"/i)?.[1]);
  return {
    width: width > 0 ? width : 16,
    height: height > 0 ? height : 9
  };
}

async function renderImage(doc, zip, chapterHref, src, alt) {
  if (!src || /^(?:https?:|data:)/i.test(src)) {
    renderParagraph(doc, alt ? `[Abbildung: ${alt}]` : '[Abbildung]', {
      size: 8.5,
      color: '#68737a',
      align: 'center'
    });
    return;
  }

  const entry = zip.file(epubEntryPath(chapterHref, src));
  if (!entry) return;

  const ext = path.extname(src).toLowerCase();
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxHeight = Math.min(330, doc.page.height * 0.42);
  ensureRoom(doc, maxHeight + 24);

  try {
    if (ext === '.svg') {
      const SVGtoPDF = require('svg-to-pdfkit');
      const svg = await entry.async('string');
      const dimensions = svgSize(svg);
      const ratio = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
      const width = dimensions.width * ratio;
      const height = dimensions.height * ratio;
      const x = doc.page.margins.left + (maxWidth - width) / 2;
      SVGtoPDF(doc, svg, x, doc.y, {
        width,
        height,
        preserveAspectRatio: 'xMidYMid meet',
        fontCallback: (family, bold, italic) => {
          if (/mono/i.test(String(family))) return 'Courier';
          if (bold && italic) return 'Helvetica-BoldOblique';
          if (bold) return 'Helvetica-Bold';
          if (italic) return 'Helvetica-Oblique';
          return 'Helvetica';
        }
      });
      doc.y += height + 8;
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      const image = await entry.async('nodebuffer');
      doc.image(image, {
        fit: [maxWidth, maxHeight],
        align: 'center'
      });
      doc.y += 8;
    } else {
      return;
    }

    if (alt) {
      renderParagraph(doc, alt, { size: 8, color: '#68737a', align: 'center', moveDown: 0.7 });
    }
  } catch (_error) {
    renderParagraph(doc, alt ? `[Abbildung: ${alt}]` : '[Abbildung]', {
      size: 8.5,
      color: '#68737a',
      align: 'center'
    });
  }
}

async function renderNode(doc, zip, chapterHref, node, context = {}) {
  if (!node) return;

  if (node.type === 'text') {
    if (!context.blockHandled) {
      const text = normalizeText(node.data);
      if (text) renderParagraph(doc, text);
    }
    return;
  }

  const tag = String(node.name || '').toLowerCase();
  if (!tag) {
    for (const child of node.children || []) {
      await renderNode(doc, zip, chapterHref, child, context);
    }
    return;
  }

  if (/^h[1-4]$/.test(tag)) {
    renderHeading(doc, textContent(node), Number(tag.slice(1)));
    return;
  }

  if (tag === 'p') {
    renderParagraph(doc, textContent(node));
    return;
  }

  if (tag === 'pre') {
    renderCode(doc, textContent(node));
    return;
  }

  if (tag === 'blockquote') {
    renderParagraph(doc, textContent(node), {
      indent: 18,
      color: '#566169',
      font: 'Helvetica-Oblique'
    });
    return;
  }

  if (tag === 'img') {
    await renderImage(doc, zip, chapterHref, node.attribs?.src, node.attribs?.alt);
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    let index = 0;
    for (const child of node.children || []) {
      if (String(child.name || '').toLowerCase() !== 'li') continue;
      index += 1;
      const prefix = tag === 'ol' ? `${index}. ` : '• ';
      renderParagraph(doc, `${prefix}${normalizeText(textContent(child))}`, { indent: 14 });
    }
    return;
  }

  if (tag === 'hr') {
    ensureRoom(doc, 24);
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.save()
      .moveTo(doc.page.margins.left, doc.y + 8)
      .lineTo(doc.page.margins.left + width, doc.y + 8)
      .strokeColor('#cbd2cf')
      .lineWidth(0.8)
      .stroke()
      .restore();
    doc.moveDown(1.2);
    return;
  }

  for (const child of node.children || []) {
    await renderNode(doc, zip, chapterHref, child, { ...context, blockHandled: false });
  }
}

async function renderChapter(doc, zip, href, html) {
  const { parseDocument } = require('htmlparser2');
  const parsed = parseDocument(html, { xmlMode: true, decodeEntities: true });
  const body = (parsed.children || []).flatMap((node) => {
    if (String(node.name || '').toLowerCase() !== 'html') return [];
    return (node.children || []).flatMap((child) =>
      String(child.name || '').toLowerCase() === 'body' ? (child.children || []) : []
    );
  });

  for (const node of body) {
    await renderNode(doc, zip, href, node);
  }
}

async function renderCoverPage(doc, zip, coverHref) {
  const entry = coverHref ? zip.file(path.posix.join('OEBPS', coverHref)) : null;
  if (!entry) return false;

  doc.addPage({ size: 'A4', margin: 0 });
  const ext = path.extname(coverHref).toLowerCase();

  if (ext === '.svg') {
    const SVGtoPDF = require('svg-to-pdfkit');
    const svg = await entry.async('string');
    SVGtoPDF(doc, svg, 0, 0, {
      width: doc.page.width,
      height: doc.page.height,
      preserveAspectRatio: 'xMidYMid slice',
      fontCallback: (family, bold, italic) => {
        if (/mono/i.test(String(family))) return 'Courier';
        if (bold && italic) return 'Helvetica-BoldOblique';
        if (bold) return 'Helvetica-Bold';
        if (italic) return 'Helvetica-Oblique';
        return 'Helvetica';
      }
    });
    return true;
  }

  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    const image = await entry.async('nodebuffer');
    doc.image(image, 0, 0, {
      fit: [doc.page.width, doc.page.height],
      align: 'center',
      valign: 'center'
    });
    return true;
  }

  return false;
}

async function buildArticlePdfFromEpub(epubBuffer) {
  const JSZip = require('jszip');
  const PDFDocument = require('pdfkit');
  const zip = await JSZip.loadAsync(epubBuffer);
  const opfEntry = zip.file('OEBPS/content.opf');
  if (!opfEntry) throw new Error('EPUB package metadata is missing');

  const opf = await opfEntry.async('string');
  const { manifest, spine, metadata } = parsePackage(opf);
  const coverHref = manifest.get('image_cover')?.href || '';

  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'A4',
    margins: { top: 54, right: 58, bottom: 58, left: 58 },
    info: {
      Title: metadata.title || 'Kernel Notes',
      Author: metadata.author || DEFAULT_AUTHOR,
      Subject: metadata.description || 'Kernel Notes article',
      Creator: 'Kernel Notes EPUB export',
      Producer: 'Kernel Notes EPUB → PDF'
    }
  });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  await renderCoverPage(doc, zip, coverHref);

  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || item.href === 'toc.xhtml' || item['media-type'] !== 'application/xhtml+xml') continue;
    const chapter = zip.file(path.posix.join('OEBPS', item.href));
    if (!chapter) continue;
    doc.addPage();
    const html = await chapter.async('string');
    await renderChapter(doc, zip, item.href, html);
  }

  if (!doc.page) doc.addPage();
  doc.end();
  return completed;
}

async function buildArticlePdf(post, options = {}) {
  const epubBuffer = await buildArticleEpub(post, options);
  return buildArticlePdfFromEpub(epubBuffer);
}

module.exports = {
  EBOOK_CSS,
  buildArticleEpub,
  buildArticlePdf,
  buildArticlePdfFromEpub,
  buildColophon,
  buildCoverSvg,
  buildPhotoCoverSvg,
  createEpubCover,
  displayAuthor,
  ensureCoverImageProperty,
  normalizeEpubDate,
  prepareChapterHtml,
  wrapCoverTitle
};
