const fs = require('node:fs/promises');
const path = require('node:path');
const {
  assetScopeFromPost,
  commonsSourceFromRemoteImage,
  isHttpUrl
} = require('./article-photo-source');

function photoBySource(manifest) {
  return new Map(
    (Array.isArray(manifest?.photos) ? manifest.photos : [])
      .filter((photo) => photo && photo.source && photo.output)
      .map((photo) => [String(photo.source), photo])
  );
}

function resolveManagedImageSource(src, manifest) {
  if (!isHttpUrl(src)) return null;

  let source;
  try {
    source = commonsSourceFromRemoteImage(src).source;
  } catch {
    return null;
  }

  const photo = photoBySource(manifest).get(source);
  if (!photo) return null;

  const output = String(photo.output || '').replace(/\\/g, '/');
  if (!output.startsWith('assets/posts/') || output.includes('..')) {
    throw new Error(`invalid managed article photo output: ${output}`);
  }

  return `/${output}`;
}

function resolveManagedImageHtml(html, manifest) {
  return String(html || '').replace(
    /\bsrc=(["'])(https:\/\/[^"']+)\1/gi,
    (match, quote, encodedSrc) => {
      const src = encodedSrc.replace(/&amp;/g, '&');
      const local = resolveManagedImageSource(src, manifest);
      return local ? `src=${quote}${local}${quote}` : match;
    }
  );
}

async function readArticlePhotoManifest(articleRef, options = {}) {
  const assetRoot = options.assetRoot || path.resolve(__dirname, '..');
  const scope = assetScopeFromPost(articleRef);
  if (!scope) return null;

  const manifestPath = path.join(assetRoot, 'media', 'photos', `${scope}.json`);
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function resolveArticlePhotoHtml(html, articleRef, options = {}) {
  const manifest = options.manifest || await readArticlePhotoManifest(articleRef, options);
  return manifest ? resolveManagedImageHtml(html, manifest) : String(html || '');
}

module.exports = {
  photoBySource,
  readArticlePhotoManifest,
  resolveArticlePhotoHtml,
  resolveManagedImageHtml,
  resolveManagedImageSource
};
