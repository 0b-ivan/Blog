const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SemanticSearchEngine } = require('../lib/search-engine');

async function writePost(directory, name, frontmatter, body) {
  await fs.writeFile(
    path.join(directory, `${name}.md`),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    'utf8'
  );
}

test('SemanticSearchEngine indexes posts and returns the best matching article', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-grep-'));
  const postsDir = path.join(root, 'posts');
  await fs.mkdir(postsDir);

  await writePost(
    postsDir,
    'docker-compose',
    'title: Docker Compose\ncategory: Container\ntags:\n  - docker\n  - compose',
    '## Mehrere Container\n\nDocker Compose startet mehrere Container aus einer Compose-Datei.'
  );
  await writePost(
    postsDir,
    'rss',
    'title: RSS Reader\ncategory: Self-Hosting\ntags:\n  - rss',
    '## FreshRSS\n\nFreshRSS ist ein selbst gehosteter Feed Reader.'
  );

  const engine = await SemanticSearchEngine.create({
    databasePath: path.join(root, 'grep.duckdb'),
    cacheDir: path.join(root, 'models'),
    postsDir,
    embedderMode: 'hash'
  });

  try {
    const results = await engine.search('docker compose container', 5);
    assert.ok(results.length >= 1);
    assert.equal(results[0].slug, 'docker-compose');
    assert.equal(results[0].url, '/posts/docker-compose');
    assert.ok(results[0].score > 0);
    assert.equal(engine.info().embedderMode, 'hash');
    assert.equal(engine.info().chunks, 2);
  } finally {
    engine.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
