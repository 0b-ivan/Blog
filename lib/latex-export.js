const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  buildAuthorHtml,
  buildPublicationContent,
  escapeHtml
} = require('./publication-content');

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

async function buildPdfHtml(post, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const publication = await buildPublicationContent(post, { assetRoot });
  const article = rewriteLocalImages(
    rewriteGlossaryLinksForPdf(publication.articleHtml),
    assetRoot
  );

  const glossary = publication.glossaryHtml
    ? rewriteLocalImages(publication.glossaryHtml, assetRoot)
    : '';

  const authorPhoto = publication.authorProfile
    ? localAssetPath(publication.authorProfile.photo || '', assetRoot)
    : '';
  const author = publication.authorProfile
    ? buildAuthorHtml(publication.authorProfile, authorPhoto)
    : '';

  return `<main class="paper-publication">
  <article class="paper-article">${article}</article>
  ${glossary}
  ${author}
</main>`;
}

function pdfMetadata(post, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const coverPath = localAssetPath(post.coverImage, assetRoot);
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const siteUrl = String(options.siteUrl || 'https://blog.obivan.org').replace(/\/+$/, '');

  return {
    title: String(post.title || ''),
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
  buildPdfDocumentPreview,
  buildPdfHtml,
  displayAuthor,
  displayDate,
  localAssetPath,
  localAssetUrl,
  pandocMetadataArgs,
  pdfMetadata,
  rewriteGlossaryLinksForPdf,
  rewriteLocalImages
};
