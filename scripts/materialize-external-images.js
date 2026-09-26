#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { commonsFileTitle } = require('./ingest-article-photos');

const root = path.resolve(__dirname, '..');
const DEFAULT_WIDTH = 1400;
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function maskFencedCode(content) {
  return String(content || '').replace(
    /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm,
    (block) => block.replace(/[^\n]/g, ' ')
  );
}

function collectMarkdownImages(content) {
  const source = maskFencedCode(content);
  const imagePattern = /!\[([^\]]*)\]\(\s*(<?[^\s)>]+>?)(?:\s+["'][^"']*["'])?\s*\)(?:\{[^}\n]+\})?/g;
  const images = [];
  let match;

  while ((match = imagePattern.exec(source)) !== null) {
    images.push({
      start: match.index,
      end: match.index + match[0].length,
      alt: match[1],
      rawTarget: match[2],
      original: String(content).slice(match.index, match.index + match[0].length)
    });
  }

  return images;
}

function cleanRemoteTarget(value) {
  const target = String(value || '').trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    return target.slice(1, -1);
  }
  return target;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanRemoteTarget(value));
}

function canonicalCommonsSource(fileTitle) {
  const wikiTitle = String(fileTitle || '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/${encodeURI(wikiTitle)}`;
}

function commonsSourceFromRemoteImage(target) {
  const raw = cleanRemoteTarget(target);
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error(`external article images must use HTTPS: ${raw}`);
  }

  if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/File:')) {
    const fileTitle = commonsFileTitle(raw);
    return {
      fileTitle,
      source: canonicalCommonsSource(fileTitle)
    };
  }

  if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:Redirect/file/')) {
    const fileName = decodeURIComponent(url.pathname.slice('/wiki/Special:Redirect/file/'.length));
    const fileTitle = `File:${fileName.replace(/_/g, ' ')}`;
    return {
      fileTitle,
      source: canonicalCommonsSource(fileTitle)
    };
  }

  if (url.hostname === 'upload.wikimedia.org') {
    const match = url.pathname.match(
      /^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[^/]+\/([^/]+)/i
    );
    if (!match) {
      throw new Error(`unsupported Wikimedia Commons upload URL: ${raw}`);
    }

    const fileName = decodeURIComponent(match[1]);
    const fileTitle = `File:${fileName.replace(/_/g, ' ')}`;
    return {
      fileTitle,
      source: canonicalCommonsSource(fileTitle)
    };
  }

  throw new Error(
    `unsupported external image provider for '${raw}'. Currently only Wikimedia Commons URLs are auto-materialized.`
  );
}

function assetScopeFromPost(postPath) {
  const file = path.posix.basename(String(postPath || '').replace(/\\/g, '/'), '.md');
  return file.replace(/^\d{4}-\d{2}-\d{2}-/, '') || file;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function extensionForCommonsFile(fileTitle) {
  const ext = path.posix.extname(String(fileTitle || '')).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `unsupported source image extension '${ext || '<none>'}'. Use a JPEG, PNG or WebP Commons image.`
    );
  }
  return ext === '.jpeg' ? '.jpg' : ext;
}

function sourceIdFor(scope, source) {
  const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 10);
  return `${slugify(scope) || 'article'}-commons-${digest}`;
}

function nextOutputIndex(photos) {
  let max = 0;
  for (const photo of photos || []) {
    const base = path.posix.basename(String(photo?.output || ''));
    const match = base.match(/^(\d+)-/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function outputPathFor({ scope, alt, fileTitle, index }) {
  const ext = extensionForCommonsFile(fileTitle);
  const fallback = path.posix.basename(fileTitle.replace(/^File:/, ''), path.posix.extname(fileTitle));
  const name = slugify(alt) || slugify(fallback) || 'image';
  return `assets/posts/${scope}/${String(index).padStart(2, '0')}-${name}${ext}`;
}

function normalizeExistingManifest(existingManifest, postPath) {
  if (!existingManifest) {
    return { version: 1, post: postPath, photos: [] };
  }
  if (existingManifest.version !== 1 || existingManifest.post !== postPath || !Array.isArray(existingManifest.photos)) {
    throw new Error(`existing photo manifest does not match ${postPath}`);
  }
  return JSON.parse(JSON.stringify(existingManifest));
}

function planRemoteImages(markdown, postPath, existingManifest = null) {
  const normalizedPost = String(postPath || '').replace(/\\/g, '/');
  if (!/^posts\/[^/]+\.md$/.test(normalizedPost)) {
    throw new Error(`post must point to a Markdown file directly below posts/: ${postPath}`);
  }

  const manifest = normalizeExistingManifest(existingManifest, normalizedPost);
  const scope = assetScopeFromPost(normalizedPost);
  const images = collectMarkdownImages(markdown).filter((image) => isHttpUrl(image.rawTarget));
  if (images.length === 0) {
    return { changed: false, markdown: String(markdown || ''), manifest, manifestPath: `media/photos/${scope}.json` };
  }

  const bySource = new Map(manifest.photos.map((photo) => [photo.source, photo]));
  let nextIndex = nextOutputIndex(manifest.photos);
  const edits = [];
  const credited = new Set(
    manifest.photos
      .filter((photo) => String(markdown || '').includes(`/sources.html#${photo.source_id}`))
      .map((photo) => photo.source_id)
  );

  for (const image of images) {
    const alt = String(image.alt || '').trim();
    if (!alt) {
      throw new Error(`${normalizedPost}: external image '${cleanRemoteTarget(image.rawTarget)}' needs alt text`);
    }

    const resolved = commonsSourceFromRemoteImage(image.rawTarget);
    let photo = bySource.get(resolved.source);

    if (!photo) {
      photo = {
        source_id: sourceIdFor(scope, resolved.source),
        provider: 'wikimedia-commons',
        source: resolved.source,
        output: outputPathFor({ scope, alt, fileTitle: resolved.fileTitle, index: nextIndex }),
        alt,
        width: DEFAULT_WIDTH
      };
      nextIndex += 1;
      manifest.photos.push(photo);
      bySource.set(resolved.source, photo);
    } else {
      photo.alt = alt;
    }

    const localTarget = `/${photo.output}`;
    let replacement = image.original.replace(image.rawTarget, localTarget);
    if (!credited.has(photo.source_id)) {
      replacement += `\n\n*Quelle/Lizenz: [Wikimedia Commons](/sources.html#${photo.source_id}).*`;
      credited.add(photo.source_id);
    }

    edits.push({ start: image.start, end: image.end, replacement });
  }

  let rewritten = String(markdown || '');
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, edit.start) + edit.replacement + rewritten.slice(edit.end);
  }

  return {
    changed: rewritten !== String(markdown || ''),
    markdown: rewritten,
    manifest,
    manifestPath: `media/photos/${scope}.json`
  };
}

async function materializePostLinks(postFile) {
  const normalizedPost = String(postFile || '').replace(/\\/g, '/');
  const absolutePost = path.resolve(root, normalizedPost);
  const markdown = await fs.readFile(absolutePost, 'utf8');
  const scope = assetScopeFromPost(normalizedPost);
  const manifestPath = `media/photos/${scope}.json`;
  const absoluteManifest = path.resolve(root, manifestPath);

  let existingManifest = null;
  try {
    existingManifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const planned = planRemoteImages(markdown, normalizedPost, existingManifest);
  if (!planned.changed) {
    console.log(`[photo-link] ${normalizedPost}: no external image URLs to materialize`);
    return planned;
  }

  await fs.mkdir(path.dirname(absoluteManifest), { recursive: true });
  await fs.writeFile(absolutePost, planned.markdown, 'utf8');
  await fs.writeFile(absoluteManifest, JSON.stringify(planned.manifest, null, 2) + '\n', 'utf8');

  const added = planned.manifest.photos.length - (existingManifest?.photos?.length || 0);
  console.log(`[photo-link] ${normalizedPost}: materialized ${added} new Commons URL(s) into ${planned.manifestPath}`);
  return planned;
}

async function main() {
  const posts = process.argv.slice(2);
  if (posts.length === 0) {
    throw new Error('Usage: node scripts/materialize-external-images.js posts/<article>.md [...]');
  }

  for (const post of posts) {
    await materializePostLinks(post);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[photo-link] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  assetScopeFromPost,
  cleanRemoteTarget,
  collectMarkdownImages,
  commonsSourceFromRemoteImage,
  extensionForCommonsFile,
  materializePostLinks,
  planRemoteImages,
  slugify,
  sourceIdFor
};
