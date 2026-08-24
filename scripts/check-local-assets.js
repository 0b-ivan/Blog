#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const scanRoots = ['posts', 'archive'];
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
  let target = value.trim();

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

function collectMarkdownAssets(content) {
  const assets = [];
  const imagePattern = /!\[[^\]]*\]\(\s*(<?[^\s)>]+>?)/g;
  let match;

  while ((match = imagePattern.exec(content)) !== null) {
    assets.push(match[1]);
  }

  return assets;
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

const files = [
  ...scanRoots.flatMap((dir) => walk(path.join(root, dir))),
  ...rootHtmlFiles,
].filter((file) => file.endsWith('.md') || file.endsWith('.html'));

const missing = [];
let checked = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const targets = file.endsWith('.md')
    ? collectMarkdownAssets(content)
    : collectHtmlAssets(content);

  for (const rawTarget of targets) {
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

if (missing.length > 0) {
  console.error(`Found ${missing.length} missing local asset(s):`);
  for (const entry of missing) {
    console.error(`- ${entry.file}: ${entry.target} -> ${entry.resolved}`);
  }
  process.exit(1);
}

console.log(`Local asset check passed: ${checked} reference(s) checked in ${files.length} file(s).`);
