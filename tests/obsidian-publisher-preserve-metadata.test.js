const {
  preserveTopLevelBlock,
  topLevelBlock
} = require('../ops/obsidian-livesync/scripts/obsidian-publisher-preserve-metadata');

describe('obsidian publisher metadata preservation', () => {
  const base = `---
title: Test
status: publish
search_queries:
  - query: Wie teste ich das?
    maxRank: 1
  - query: Zweite Frage
    maxRank: 3
---

# Test
`;

  it('reads a multiline top-level frontmatter block', () => {
    expect(topLevelBlock(base, 'search_queries')).toBe(`search_queries:
  - query: Wie teste ich das?
    maxRank: 1
  - query: Zweite Frage
    maxRank: 3`);
  });

  it('preserves search_queries from main when Obsidian omits them', () => {
    const obsidian = `---
title: Test
status: publish
tags:
  - DevOps
---

# Geändert in Obsidian
`;

    const result = preserveTopLevelBlock(obsidian, base, 'search_queries');

    expect(result).toContain('tags:\n  - DevOps\nsearch_queries:');
    expect(result).toContain('query: Wie teste ich das?');
    expect(result).toContain('# Geändert in Obsidian');
  });

  it('keeps explicit search_queries from Obsidian untouched', () => {
    const obsidian = `---
title: Test
status: publish
search_queries:
  - query: Neue Frage aus Obsidian
    maxRank: 2
---

# Test
`;

    expect(preserveTopLevelBlock(obsidian, base, 'search_queries')).toBe(obsidian);
  });

  it('does nothing for a new article without base search_queries', () => {
    const obsidian = `---
title: Neu
status: publish
---

# Neu
`;
    const main = `---
title: Neu
status: draft
---

# Neu
`;

    expect(preserveTopLevelBlock(obsidian, main, 'search_queries')).toBe(obsidian);
  });
});
