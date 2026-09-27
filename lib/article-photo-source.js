const path = require('node:path');
const { URL } = require('node:url');

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
    const fileTitle = `File:${decodeURIComponent(url.pathname.slice('/wiki/File:'.length)).replace(/_/g, ' ')}`;
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

module.exports = {
  assetScopeFromPost,
  canonicalCommonsSource,
  cleanRemoteTarget,
  commonsSourceFromRemoteImage,
  isHttpUrl
};
