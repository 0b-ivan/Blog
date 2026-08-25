const {
  buildRegressionFixture,
  parseSearchQueries,
  regressionFixturePath
} = require('../ops/obsidian-livesync/scripts/obsidian-publisher');

describe('obsidian publisher search regression fixtures', () => {
  it('reads structured search_queries from frontmatter', () => {
    const raw = `---
title: Dwarf Fortress im Browser
status: publish
search_queries:
  - query: "Wie kann ich Dwarf Fortress im Browser spielen?"
    maxRank: 1
  - query: Wie funktioniert Dwarf Fortress mit Proxmox?
    maxRank: 3
---

Text
`;

    expect(parseSearchQueries(raw)).toEqual([
      {
        query: 'Wie kann ich Dwarf Fortress im Browser spielen?',
        maxRank: 1
      },
      {
        query: 'Wie funktioniert Dwarf Fortress mit Proxmox?',
        maxRank: 3
      }
    ]);
  });

  it('accepts a simple search_queries list', () => {
    const raw = `---
status: publish
search_queries:
  - Erste Suchfrage
  - Zweite Suchfrage
---
`;

    expect(parseSearchQueries(raw)).toEqual([
      { query: 'Erste Suchfrage', maxRank: 1 },
      { query: 'Zweite Suchfrage', maxRank: 1 }
    ]);
  });

  it('generates a title fallback for a new article without explicit queries', () => {
    const fixture = JSON.parse(buildRegressionFixture(
      '2026-08-23-dwarf-fortress-im-browser.md',
      'Dwarf Fortress im Browser',
      '---\nstatus: publish\n---\n'
    ));

    expect(fixture).toEqual({
      post: '2026-08-23-dwarf-fortress-im-browser',
      queries: [
        {
          query: 'Dwarf Fortress im Browser',
          maxRank: 1
        }
      ]
    });
  });

  it('keeps an existing curated fixture when search_queries are not set', () => {
    const existing = '{"post":"2026-08-19-test","queries":[{"query":"curated","maxRank":2}]}\n';
    expect(buildRegressionFixture(
      '2026-08-19-test.md',
      'Test',
      '---\nstatus: publish\n---\n',
      existing
    )).toBe(existing);
  });

  it('uses one deterministic regression fixture path per article', () => {
    expect(regressionFixturePath('2026-08-23-test.md'))
      .toBe('rag/regression/cases/2026-08-23-test.json');
  });
});
