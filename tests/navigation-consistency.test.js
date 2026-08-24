const fs = require('node:fs/promises');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const navigationSources = [
  'index.html',
  'about.html',
  'impressum.html',
  'datenschutz.html',
  'grep.html',
  'snippets/index.html',
  'server.js',
  'enhanced-server.js'
];

const expectedNavigation = [
  ['Artikel', '/#posts'],
  ['Themen', '/#topics'],
  ['Snippets', '/snippets/'],
  ['Glossar', '/glossary'],
  ['Wissensnetz', '/knowledge'],
  ['Archiv', '/archive']
];

function extractNavigation(source) {
  const navigation = source.match(/<nav class="main-nav"[^>]*>([\s\S]*?)<\/nav>/);
  if (!navigation) {
    throw new Error('main-nav not found');
  }

  return [...navigation[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map((match) => [match[2].trim(), match[1]]);
}

describe('primary navigation', () => {
  it.each(navigationSources)('%s uses the canonical navigation', async (file) => {
    const source = await fs.readFile(path.join(repoRoot, file), 'utf8');
    expect(extractNavigation(source)).toEqual(expectedNavigation);
  });
});

