const path = require('node:path');
const fs = require('node:fs');
const MarkdownIt = require('markdown-it');
const parser = new MarkdownIt();

function safePath(value) {
  return typeof value === 'string' && value.split('/').every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..');
}

function defaults(file, language) {
  const extension = path.extname(file).toLowerCase();
  const lang = language || ({ '.sh': 'bash', '.yml': 'yaml', '.yaml': 'yaml', '.ini': 'ini', '.dockerfile': 'dockerfile' })[extension] || 'plaintext';
  const type = extension === '.sh' ? 'Shellskript' : ({ yaml: 'YAML', ini: 'INI', dockerfile: 'Dockerfile', bash: 'Shellskript', sh: 'Shellskript', shell: 'Shellskript' })[lang] || 'Code';
  return { language: lang, type };
}

function references(markdown) {
  const result = [];
  for (const token of parser.parse(markdown, {})) {
    const children = token.children || [];
    children.forEach((child, index) => {
      if (child.type !== 'link_open') return;
      const marker = child.attrGet('title') || '';
      const href = child.attrGet('href') || '';
      if (!marker.startsWith('snippet:') || !href.startsWith('/snippets/')) return;
      let title = '';
      for (let next = index + 1; next < children.length && children[next].type !== 'link_close'; next++) title += children[next].content;
      result.push({ path: href.slice('/snippets/'.length), title, language: marker.split(':')[1] });
    });
  }
  return result;
}

function resolveSnippets({ slug, title, data = {}, markdown = '', legacy = [], snippetsDir }) {
  const entries = new Map();
  for (const entry of references(markdown)) entries.set(entry.path, entry);
  for (const entry of legacy.filter((item) => item.post === slug)) entries.set(entry.path, { ...entries.get(entry.path), ...entry });
  if (data.snippets != null && !Array.isArray(data.snippets)) throw new Error('snippets must be a list');
  const seen = new Set();
  for (const entry of data.snippets || []) {
    if (!entry || !safePath(entry.file)) throw new Error('snippet file must be a relative path without traversal');
    const file = `${slug}/${entry.file}`;
    if (seen.has(file)) throw new Error(`duplicate snippet: ${entry.file}`);
    seen.add(file);
    for (const field of Object.keys(entry)) {
      if (!['file', 'title', 'description', 'language', 'type'].includes(field)) throw new Error(`unknown snippet field: ${field}`);
      if (typeof entry[field] !== 'string') throw new Error(`snippet ${field} must be text`);
      if (field !== 'description' && !entry[field].trim()) throw new Error(`snippet ${field} must not be empty`);
    }
    entries.set(file, { ...entries.get(file), ...entry, path: file });
  }
  return [...entries.values()].map((entry) => {
    if (!safePath(entry.path)) throw new Error(`invalid snippet path: ${entry.path}`);
    if (snippetsDir && !fs.statSync(path.join(snippetsDir, entry.path)).isFile()) throw new Error(`snippet is not a file: ${entry.path}`);
    if (entry.language && !/^[\w+-]+$/.test(entry.language)) throw new Error(`invalid snippet language: ${entry.language}`);
    const description = entry.description ?? entry.usage ?? '';
    return {
      path: entry.path,
      title: entry.title || path.basename(entry.path),
      ...defaults(entry.path, entry.language),
      ...(entry.type ? { type: entry.type } : {}),
      description,
      usage: description,
      post: slug,
      postTitle: title || slug
    };
  });
}

function installSnippetRenderer(md) {
  const original = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if ((token.attrGet('title') || '').startsWith('snippet:')) {
      const file = (token.attrGet('href') || '').replace(/^\/snippets\//, '');
      const snippet = env.snippets?.find((item) => item.path === file);
      if (snippet) token.attrSet('data-snippet', JSON.stringify(snippet));
    }
    return original ? original(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };
}

module.exports = { resolveSnippets, installSnippetRenderer };
