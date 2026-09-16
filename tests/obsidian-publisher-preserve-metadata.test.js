const {
  normalizeEmptyListField,
  normalizeTagWhitespace,
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

  it('normalizes whitespace in list-style tags without touching article text', () => {
    const raw = `---
title: VPC
status: publish
tags:
  - AWS
  - Route Table
  - "Security Group"
---

Route Table bleibt im Artikeltext lesbar.
`;

    const result = normalizeTagWhitespace(raw);

    expect(result).toContain('  - Route-Table');
    expect(result).toContain('  - "Security-Group"');
    expect(result).toContain('Route Table bleibt im Artikeltext lesbar.');
  });

  it('normalizes whitespace in inline tag arrays', () => {
    const raw = `---
title: VPC
status: publish
tags: [AWS, Route Table, "Internet Gateway"]
---

# VPC
`;

    expect(normalizeTagWhitespace(raw)).toContain(
      'tags: [AWS, Route-Table, "Internet-Gateway"]'
    );
  });

  it('normalizes whitespace in legacy comma-separated tag strings', () => {
    const raw = `---
title: Dependabot
status: publish
tags: GitHub, Dependabot, Supply Chain, DevOps
---

# Dependabot
`;

    expect(normalizeTagWhitespace(raw)).toContain(
      'tags: GitHub, Dependabot, Supply-Chain, DevOps'
    );
  });

  it('normalizes an empty snippets property to an empty YAML list', () => {
    const raw = `---
title: RSS
status: publish
snippets:
---

# RSS
`;

    expect(normalizeEmptyListField(raw, 'snippets')).toContain('snippets: []');
  });
});
