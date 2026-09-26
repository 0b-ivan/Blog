#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { URL, URLSearchParams } = require('node:url');

const root = path.resolve(__dirname, '..');
const sourceCatalogPath = path.join(root, 'posts', '_sources.json');
const DEFAULT_THUMB_WIDTH = 1400;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROVIDERS = new Set(['wikimedia-commons']);

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function commonsFileTitle(sourceUrl) {
  const url = new URL(String(sourceUrl || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'commons.wikimedia.org') {
    throw new Error(`Wikimedia Commons source must use https://commons.wikimedia.org: ${sourceUrl}`);
  }

  const prefix = '/wiki/File:';
  if (!url.pathname.startsWith(prefix)) {
    throw new Error(`Wikimedia Commons source must be a File page: ${sourceUrl}`);
  }

  return `File:${decodeURIComponent(url.pathname.slice(prefix.length)).replace(/_/g, ' ')}`;
}

function licenseIsReusable(value) {
  const license = String(value || '').trim().toUpperCase();
  return /^(?:CC0(?:\s|$)|PUBLIC DOMAIN$|CC BY(?:-|\s)|CC BY-SA(?:-|\s))/.test(license);
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function extensionMatchesType(output, type) {
  const ext = path.extname(String(output || '')).toLowerCase();
  if (type === 'jpeg') return ext === '.jpg' || ext === '.jpeg';
  if (type === 'png') return ext === '.png';
  if (type === 'webp') return ext === '.webp';
  return false;
}

function validateOutputPath(output) {
  const normalized = String(output || '').replace(/\\/g, '/');
  if (!normalized.startsWith('assets/posts/') || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`Photo output must stay below assets/posts/: ${output}`);
  }
  return normalized;
}

function validateManifest(manifest, manifestPath = '<manifest>') {
  if (!manifest || manifest.version !== 1) {
    throw new Error(`${manifestPath}: version must be 1`);
  }
  if (!/^posts\/[^/]+\.md$/.test(String(manifest.post || ''))) {
    throw new Error(`${manifestPath}: post must point to a Markdown file directly below posts/`);
  }
  if (!Array.isArray(manifest.photos) || manifest.photos.length === 0) {
    throw new Error(`${manifestPath}: photos must contain at least one entry`);
  }

  const outputs = new Set();
  const sourceIds = new Set();
  for (const photo of manifest.photos) {
    if (!ALLOWED_PROVIDERS.has(photo.provider)) {
      throw new Error(`${manifestPath}: unsupported provider '${photo.provider}'`);
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(photo.source_id || ''))) {
      throw new Error(`${manifestPath}: invalid source_id '${photo.source_id || ''}'`);
    }
    if (sourceIds.has(photo.source_id)) {
      throw new Error(`${manifestPath}: duplicate source_id '${photo.source_id}'`);
    }
    sourceIds.add(photo.source_id);

    const output = validateOutputPath(photo.output);
    if (outputs.has(output)) {
      throw new Error(`${manifestPath}: duplicate output '${output}'`);
    }
    outputs.add(output);

    if (!String(photo.alt || '').trim()) {
      throw new Error(`${manifestPath}: every photo needs alt text`);
    }

    if (photo.provider === 'wikimedia-commons') {
      commonsFileTitle(photo.source);
    }
  }

  return manifest;
}

function metadataValue(extmetadata, key) {
  return extmetadata?.[key]?.value || '';
}

async function resolveCommonsPhoto(photo, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const fileTitle = commonsFileTitle(photo.source);
  const width = Number(photo.width || options.defaultWidth || DEFAULT_THUMB_WIDTH);
  if (!Number.isInteger(width) || width < 320 || width > 2400) {
    throw new Error(`${photo.source_id}: width must be between 320 and 2400 pixels`);
  }

  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: String(width),
    titles: fileTitle
  }).toString();

  const response = await fetchImpl(api, {
    headers: { 'User-Agent': 'kernel-notes-photo-connection/1.0' }
  });
  if (!response.ok) {
    throw new Error(`${photo.source_id}: Commons API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const page = payload?.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info) {
    throw new Error(`${photo.source_id}: Commons file was not found`);
  }

  const license = stripHtml(metadataValue(info.extmetadata, 'LicenseShortName'));
  if (!licenseIsReusable(license)) {
    throw new Error(`${photo.source_id}: unsupported or unclear license '${license || '<missing>'}'`);
  }

  if (photo.expected_license && license.toUpperCase() !== String(photo.expected_license).trim().toUpperCase()) {
    throw new Error(`${photo.source_id}: license changed: expected '${photo.expected_license}', got '${license}'`);
  }

  const downloadUrl = info.thumburl || info.url;
  const mime = String(info.thumbmime || info.mime || '').toLowerCase();
  if (!/^image\/(?:jpeg|png|webp)$/.test(mime)) {
    throw new Error(`${photo.source_id}: unsupported image MIME type '${mime}'`);
  }

  return {
    downloadUrl,
    mime,
    source: {
      title: fileTitle.replace(/^File:/, ''),
      publisher: 'Wikimedia Commons',
      url: photo.source,
      author: stripHtml(metadataValue(info.extmetadata, 'Artist')) || 'Unknown',
      license,
      license_url: stripHtml(metadataValue(info.extmetadata, 'LicenseUrl')) || undefined
    }
  };
}

async function downloadImage(resolved, photo, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxBytes = Number(photo.max_bytes || options.maxBytes || DEFAULT_MAX_BYTES);
  const response = await fetchImpl(resolved.downloadUrl, {
    headers: { 'User-Agent': 'kernel-notes-photo-connection/1.0' },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`${photo.source_id}: image download returned HTTP ${response.status}`);
  }

  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > maxBytes) {
    throw new Error(`${photo.source_id}: image exceeds ${maxBytes} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) {
    throw new Error(`${photo.source_id}: downloaded image is suspiciously small (${buffer.length} bytes)`);
  }
  if (buffer.length > maxBytes) {
    throw new Error(`${photo.source_id}: downloaded image exceeds ${maxBytes} bytes`);
  }

  const type = detectImageType(buffer);
  if (!type) {
    throw new Error(`${photo.source_id}: downloaded file has unknown image magic bytes`);
  }
  if (!extensionMatchesType(photo.output, type)) {
    throw new Error(`${photo.source_id}: output extension does not match downloaded ${type} image`);
  }

  return buffer;
}

function verifyArticleBinding(markdown, photo) {
  const expectedPath = `/${validateOutputPath(photo.output)}`;
  const imageNeedle = `![${photo.alt}](${expectedPath})`;
  if (!String(markdown || '').includes(imageNeedle)) {
    throw new Error(`${photo.source_id}: article must contain exact image reference: ${imageNeedle}`);
  }

  const sourceNeedle = `/sources.html#${photo.source_id}`;
  if (!String(markdown || '').includes(sourceNeedle)) {
    throw new Error(`${photo.source_id}: article must link its credit to ${sourceNeedle}`);
  }
}

async function ingestManifest(manifestFile, options = {}) {
  const absoluteManifest = path.resolve(root, manifestFile);
  const manifest = validateManifest(
    JSON.parse(await fs.readFile(absoluteManifest, 'utf8')),
    path.relative(root, absoluteManifest)
  );

  const articlePath = path.resolve(root, manifest.post);
  const markdown = await fs.readFile(articlePath, 'utf8');
  const catalog = JSON.parse(await fs.readFile(sourceCatalogPath, 'utf8'));

  for (const photo of manifest.photos) {
    verifyArticleBinding(markdown, photo);

    let resolved;
    if (photo.provider === 'wikimedia-commons') {
      resolved = await resolveCommonsPhoto(photo, options);
    } else {
      throw new Error(`${photo.source_id}: unsupported provider '${photo.provider}'`);
    }

    const buffer = await downloadImage(resolved, photo, options);
    const output = path.resolve(root, validateOutputPath(photo.output));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, buffer);

    const existing = catalog[photo.source_id] || {};
    catalog[photo.source_id] = {
      title: resolved.source.title,
      publisher: resolved.source.publisher,
      url: resolved.source.url,
      accessed_at: existing.accessed_at || new Date().toISOString().slice(0, 10),
      author: resolved.source.author,
      license: resolved.source.license,
      ...(resolved.source.license_url ? { license_url: resolved.source.license_url } : {})
    };

    console.log(
      `[photo] ${photo.source_id}: ${path.relative(root, output)} (${buffer.length} bytes, ${resolved.source.license})`
    );
  }

  await fs.writeFile(sourceCatalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
}

async function main() {
  const manifests = process.argv.slice(2);
  if (manifests.length === 0) {
    throw new Error('Usage: node scripts/ingest-article-photos.js media/photos/<article>.json [...]');
  }

  for (const manifest of manifests) {
    await ingestManifest(manifest);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[photo] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  commonsFileTitle,
  detectImageType,
  downloadImage,
  extensionMatchesType,
  ingestManifest,
  licenseIsReusable,
  resolveCommonsPhoto,
  stripHtml,
  validateManifest,
  validateOutputPath,
  verifyArticleBinding
};
