#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const scanRoots = ['posts', 'archive'];
const ARTICLE_IMAGE_PREFIX = '/assets/posts/';
const rootHtmlFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.html'))
  .map((name) => path.join(root, name));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)
    || /^(?:data|mailto|tel):/i.test(value)
    || value.startsWith('#');
}

function cleanTarget(value) {
  let target = String(value || '').trim();

  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  }

  target = target.split('#', 1)[0].split('?', 1)[0];

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function resolveTarget(sourceFile, target) {
  if (target.startsWith('/')) {
    return path.join(root, target.replace(/^\/+/, ''));
  }

  return path.resolve(path.dirname(sourceFile), target);
}

function stripFencedCode(content) {
  return String(content || '').replace(
    /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm,
    ''
  );
}

function collectMarkdownImages(content) {
  const images = [];
  const source = stripFencedCode(content);
  const imagePattern = /!\[([^\]]*)\]\(\s*(<?[^\s)>]+>?)(?:\s+["'][^"']*["'])?\s*\)/g;
  let match;

  while ((match = imagePattern.exec(source)) !== null) {
    images.push({
      alt: match[1],
      target: match[2]
    });
  }

  return images;
}

function collectHtmlAssets(content) {
  const assets = [];
  const sourcePattern = /\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = sourcePattern.exec(content)) !== null) {
    assets.push(match[1]);
  }

  return assets;
}

function articleImagePolicyViolations(image) {
  const violations = [];
  const alt = String(image?.alt || '').trim();
  const rawTarget = String(image?.target || '').trim();
  const target = cleanTarget(rawTarget);

  if (!alt) {
    violations.push('missing alt text');
  }

  if (!rawTarget || isExternal(rawTarget)) {
    violations.push('article images must be stored locally under /assets/posts/; external/data targets are not allowed');
    return violations;
  }

  if (!target.startsWith(ARTICLE_IMAGE_PREFIX)) {
    violations.push(`article images must use a root-relative ${ARTICLE_IMAGE_PREFIX} path`);
  }

  return violations;
}

function main() {
  const files = [
    ...scanRoots.flatMap((dir) => walk(path.join(root, dir))),
    ...rootHtmlFiles,
  ].filter((file) => file.endsWith('.md') || file.endsWith('.html'));

  const missing = [];
  const policyViolations = [];
  let checked = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    if (file.endsWith('.md')) {
      const images = collectMarkdownImages(content);

      for (const image of images) {
        const filePath = path.relative(root, file);
        for (const reason of articleImagePolicyViolations(image)) {
          policyViolations.push({
            file: filePath,
            target: image.target,
            reason
          });
        }

        if (!image.target || isExternal(image.target) || image.target.includes('${')) continue;

        const target = cleanTarget(image.target);
        if (!target || isExternal(target)) continue;

        checked += 1;
        const resolved = resolveTarget(file, target);

        if (!fs.existsSync(resolved)) {
          missing.push({
            file: filePath,
            target: image.target,
            resolved: path.relative(root, resolved),
          });
        }
      }

      continue;
    }

    for (const rawTarget of collectHtmlAssets(content)) {
      if (!rawTarget || isExternal(rawTarget) || rawTarget.includes('${')) continue;

      const target = cleanTarget(rawTarget);
      if (!target || isExternal(target)) continue;

      checked += 1;
      const resolved = resolveTarget(file, target);

      if (!fs.existsSync(resolved)) {
        missing.push({
          file: path.relative(root, file),
          target: rawTarget,
          resolved: path.relative(root, resolved),
        });
      }
    }
  }

  if (policyViolations.length > 0) {
    console.error(`Found ${policyViolations.length} article image policy violation(s):`);
    for (const entry of policyViolations) {
      console.error(`- ${entry.file}: ${entry.target || '<empty>'} (${entry.reason})`);
    }
  }

  if (missing.length > 0) {
    console.error(`Found ${missing.length} missing local asset(s):`);
    for (const entry of missing) {
      console.error(`- ${entry.file}: ${entry.target} -> ${entry.resolved}`);
    }
  }

  if (policyViolations.length > 0 || missing.length > 0) {
    process.exit(1);
  }

  console.log(
    `Local asset and article image policy check passed: ${checked} local reference(s) checked in ${files.length} file(s).`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  ARTICLE_IMAGE_PREFIX,
  articleImagePolicyViolations,
  cleanTarget,
  collectHtmlAssets,
  collectMarkdownImages,
  isExternal,
  resolveTarget,
  stripFencedCode
};
