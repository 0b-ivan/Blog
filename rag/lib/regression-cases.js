const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

function normalizeSearchQueries(value, source = 'article') {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${source}: search_queries must be an array`);
  }

  const seen = new Set();
  return value.map((entry, index) => {
    let query;
    let maxRank = 1;

    if (typeof entry === 'string') {
      query = entry;
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      query = entry.query;
      maxRank = entry.maxRank ?? entry.max_rank ?? 1;
    } else {
      throw new Error(`${source}: search_queries entry ${index + 1} must be a string or object`);
    }

    query = String(query || '').trim();
    if (query.length < 2) {
      throw new Error(`${source}: search_queries entry ${index + 1} has an invalid query`);
    }

    const parsedMaxRank = Number(maxRank);
    if (!Number.isInteger(parsedMaxRank) || parsedMaxRank < 1 || parsedMaxRank > 12) {
      throw new Error(`${source}: search_queries entry ${index + 1} maxRank must be an integer from 1 to 12`);
    }

    const normalized = query.toLocaleLowerCase('de-DE');
    if (seen.has(normalized)) {
      throw new Error(`${source}: duplicate search query: ${query}`);
    }
    seen.add(normalized);

    return {
      query,
      maxRank: parsedMaxRank
    };
  });
}

function parseArticleRegressionCase(raw, slug, source = slug) {
  const parsed = matter(String(raw || ''));
  return {
    post: slug,
    queries: normalizeSearchQueries(parsed.data.search_queries, source)
  };
}

async function loadArticleRegressionCases(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const fixtures = new Map();

  for (const entry of entries
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name, 'de-DE'))) {
    const filePath = path.join(directory, entry.name);
    const slug = path.basename(entry.name, '.md');
    const raw = await fs.readFile(filePath, 'utf8');
    fixtures.set(slug, parseArticleRegressionCase(raw, slug, filePath));
  }

  return fixtures;
}

module.exports = {
  loadArticleRegressionCases,
  normalizeSearchQueries,
  parseArticleRegressionCase
};
