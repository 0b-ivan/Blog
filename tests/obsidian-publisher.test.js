const {
  StableTracker,
  branchForFile,
  parseFrontmatter,
  parsePositiveInteger,
  stripYamlQuotes
} = require('../ops/obsidian-livesync/scripts/obsidian-publisher');

describe('obsidian publisher', () => {
  it('reads publish metadata from YAML frontmatter', () => {
    const parsed = parseFrontmatter(`---\ntitle: "Mein Artikel"\nstatus: publish\ntags:\n  - Docker\n---\n\nText\n`);

    expect(parsed.title).toBe('Mein Artikel');
    expect(parsed.status).toBe('publish');
  });

  it('ignores files without valid frontmatter', () => {
    expect(parseFrontmatter('# Kein Frontmatter')).toEqual({});
    expect(parseFrontmatter('---\nstatus: publish\n')).toEqual({});
  });

  it('creates one deterministic branch per article', () => {
    expect(branchForFile('2026-08-23-Mein Artikel.md')).toBe('obsidian/2026-08-23-mein-artikel');
  });

  it('waits until content is stable for the debounce window', () => {
    const tracker = new StableTracker(300000);

    expect(tracker.observe('post.md', 'hash-a', 0)).toBe(false);
    expect(tracker.observe('post.md', 'hash-a', 299999)).toBe(false);
    expect(tracker.observe('post.md', 'hash-a', 300000)).toBe(true);

    tracker.markProcessed('post.md', 'hash-a');
    expect(tracker.observe('post.md', 'hash-a', 600000)).toBe(false);

    expect(tracker.observe('post.md', 'hash-b', 600000)).toBe(false);
    expect(tracker.observe('post.md', 'hash-b', 900000)).toBe(true);
  });

  it('normalizes simple YAML strings and numeric settings', () => {
    expect(stripYamlQuotes('"publish"')).toBe('publish');
    expect(stripYamlQuotes("'draft'")).toBe('draft');
    expect(parsePositiveInteger('15', 30)).toBe(15);
    expect(parsePositiveInteger('0', 30)).toBe(30);
  });
});
