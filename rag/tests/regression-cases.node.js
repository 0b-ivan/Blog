const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeSearchQueries,
  parseArticleRegressionCase
} = require('../lib/regression-cases');

test('reads structured search_queries from article frontmatter', () => {
  const fixture = parseArticleRegressionCase(`---
title: Dwarf Fortress im Browser
status: publish
search_queries:
  - query: "Wie kann ich Dwarf Fortress im Browser spielen?"
    maxRank: 1
  - query: Wie funktioniert Dwarf Fortress mit Proxmox?
    maxRank: 3
---

Text
`, '2026-08-23-dwarf-fortress-im-browser');

  assert.deepEqual(fixture, {
    post: '2026-08-23-dwarf-fortress-im-browser',
    queries: [
      {
        query: 'Wie kann ich Dwarf Fortress im Browser spielen?',
        maxRank: 1
      },
      {
        query: 'Wie funktioniert Dwarf Fortress mit Proxmox?',
        maxRank: 3
      }
    ]
  });
});

test('accepts a simple search_queries list with maxRank 1', () => {
  const fixture = parseArticleRegressionCase(`---
status: publish
search_queries:
  - Erste Suchfrage
  - Zweite Suchfrage
---
`, 'test');

  assert.deepEqual(fixture.queries, [
    { query: 'Erste Suchfrage', maxRank: 1 },
    { query: 'Zweite Suchfrage', maxRank: 1 }
  ]);
});

test('returns no queries when search_queries is missing', () => {
  const fixture = parseArticleRegressionCase('---\nstatus: publish\n---\n', 'test');
  assert.deepEqual(fixture.queries, []);
});

test('rejects invalid maxRank values', () => {
  assert.throws(
    () => normalizeSearchQueries([{ query: 'Testfrage', maxRank: 13 }], 'test.md'),
    /maxRank must be an integer from 1 to 12/
  );
});

test('rejects duplicate queries in one article', () => {
  assert.throws(
    () => normalizeSearchQueries([
      { query: 'Gleiche Frage', maxRank: 1 },
      { query: 'gleiche frage', maxRank: 2 }
    ], 'test.md'),
    /duplicate search query/
  );
});
