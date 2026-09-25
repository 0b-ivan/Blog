const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  buildAuthorHtml,
  buildPublicationContent
} = require('./publication-content');
const {
  resolveCoverSubtitle,
  resolveCoverTitle
} = require('./cover-metadata');

function displayAuthor(value) {
  const raw = String(value || '').trim();
  return !raw || ['obivan', '0b-ivan'].includes(raw.toLowerCase())
    ? 'Ivan Babayev'
    : raw;
}

function displayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function localAssetPath(src, assetRoot) {
  if (!String(src || '').startsWith('/assets/')) return '';
  const root = path.resolve(assetRoot, 'assets');
  const requested = path.resolve(assetRoot, String(src).replace(/^\//, ''));
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) return '';
  return requested;
}

function localAssetUrl(src, assetRoot) {
  const local = localAssetPath(src, assetRoot);
  return local ? pathToFileURL(local).href : '';
}

function rewriteLocalImages(html, assetRoot) {
  return String(html || '').replace(/\bsrc="([^"]+)"/g, (_match, src) => {
    if (/^(?:https?:|file:|data:)/i.test(src)) return `src="${src}"`;
    const local = localAssetPath(src, assetRoot);
    return local ? `src="${local}"` : `src="${src}"`;
  });
}

function rewriteGlossaryLinksForPdf(html) {
  return String(html || '').replace(/href="glossary\.xhtml#([^"]+)"/g, 'href="#$1"');
}

function rewriteSourceLinksForPdf(html) {
  return String(html || '').replace(
    /href="sources\.xhtml#source-([^"]+)"/g,
    'href="#source-$1"'
  );
}

function sizeFigureImage(imageTag) {
  const bare = String(imageTag || '')
    .replace(/\s+(?:width|height)="[^"]*"/gi, '')
    .replace(/\s*\/?\s*>$/, '');

  return `${bare} width="88%" height="52%" />`;
}

function normalizeFiguresForPdf(html) {
  return String(html || '').replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>(?:\s*<p>\s*<em>([\s\S]*?)<\/em>\s*<\/p>)?/gi,
    (_match, imageTag, explicitCaption) => {
      const alt = String(imageTag.match(/\balt="([^"]*)"/i)?.[1] || '').trim();
      const caption = String(explicitCaption || alt || 'Abbildung').trim();
      return `<figure class="paper-figure">
  ${sizeFigureImage(imageTag)}
  <figcaption>${caption}</figcaption>
</figure>`;
    }
  );
}

function promoteArticleHeadings(html) {
  return String(html || '')
    .replace(/<h([2-4])\b([^>]*)>/gi, (_match, level, attributes) => `<h${Number(level) - 1}${attributes}>`)
    .replace(/<\/h([2-4])>/gi, (_match, level) => `</h${Number(level) - 1}>`);
}

function bibValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bibKey(value, index) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || `source-${index + 1}`;
}

function buildBibTeX(entries) {
  return (entries || []).map((entry, index) => {
    const key = bibKey(entry.id, index);
    const fields = [
      `  title = {${bibValue(entry.title || entry.id)}}`,
      entry.author ? `  author = {${bibValue(entry.author)}}` : '',
      entry.publisher ? `  organization = {${bibValue(entry.publisher)}}` : '',
      entry.url ? `  url = {${bibValue(entry.url)}}` : '',
      entry.accessed_at ? `  urldate = {${bibValue(entry.accessed_at)}}` : '',
      entry.license
        ? `  note = {${bibValue(entry.license)}${entry.license_url ? `: ${bibValue(entry.license_url)}` : ''}}`
        : ''
    ].filter(Boolean);

    return `@misc{${key},\n${fields.join(',\n')}\n}`;
  }).join('\n\n');
}

async function buildPdfPublication(post, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const publication = await buildPublicationContent(post, { assetRoot });
  const article = rewriteLocalImages(
    normalizeFiguresForPdf(
      promoteArticleHeadings(
        rewriteSourceLinksForPdf(
          rewriteGlossaryLinksForPdf(publication.articleHtml)
        )
      )
    ),
    assetRoot
  );

  const glossary = publication.glossaryHtml
    ? rewriteLocalImages(
      publication.glossaryHtml.replace('<h1>', '<h1 class="unnumbered">'),
      assetRoot
    )
    : '';

  const sources = publication.sourcesHtml
    ? publication.sourcesHtml.replace('<h1>', '<h1 class="unnumbered">')
    : '';

  const authorPhoto = publication.authorProfile
    ? localAssetPath(publication.authorProfile.photo || '', assetRoot)
    : '';
  const author = publication.authorProfile
    ? buildAuthorHtml(publication.authorProfile, authorPhoto)
      .replace('<h1>', '<h1 class="unnumbered">')
      .replace(
        '<img class="ebook-author__photo"',
        '<img class="ebook-author__photo" width="28%" height="28%"'
      )
    : '';

  const html = `<main class="paper-publication">
  <article class="paper-article">${article}</article>
  ${glossary}
  ${sources}
  ${author}
</main>`;

  return {
    html,
    sources: publication.sources
  };
}

async function buildPdfHtml(post, options = {}) {
  return (await buildPdfPublication(post, options)).html;
}

function pdfMetadata(post, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const coverPath = localAssetPath(post.coverImage, assetRoot);
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const siteUrl = String(options.siteUrl || 'https://blog.obivan.org').replace(/\/+$/, '');

  return {
    title: String(post.title || ''),
    coverTitle: resolveCoverTitle(post),
    coverSubtitle: resolveCoverSubtitle(post, { maxLength: 150 }),
    author: displayAuthor(post.author),
    date: displayDate(post.date),
    category: String(post.category || 'IT'),
    abstract: String(post.excerpt || ''),
    keywords: tags.join(', '),
    readingTime: String(Number(post.readingTime) || 1),
    sourceUrl: `${siteUrl}/posts/${encodeURIComponent(post.slug)}`,
    coverImage: coverPath
  };
}

function pandocMetadataArgs(metadata) {
  return Object.entries(metadata)
    .filter(([, value]) => String(value || '').trim())
    .flatMap(([key, value]) => ['-M', `${key}=${String(value)}`]);
}

function buildPdfDocumentPreview(post, options = {}) {
  const meta = pdfMetadata(post, options);
  return {
    metadata: meta,
    title: meta.title,
    author: meta.author,
    abstract: meta.abstract,
    keywords: meta.keywords
  };
}

module.exports = {
  buildBibTeX,
  buildPdfDocumentPreview,
  buildPdfHtml,
  buildPdfPublication,
  displayAuthor,
  displayDate,
  localAssetPath,
  localAssetUrl,
  normalizeFiguresForPdf,
  pandocMetadataArgs,
  promoteArticleHeadings,
  pdfMetadata,
  rewriteGlossaryLinksForPdf,
  rewriteSourceLinksForPdf,
  rewriteLocalImages
};
