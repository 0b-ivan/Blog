const {
  branchForSource,
  isValidHttpUrl,
  sourceEntryFromFrontmatter,
  sourceFileName,
  sourceMarkdown
} = require('../ops/obsidian-livesync/scripts/obsidian-sources-publisher');
const {
  parseFrontmatter
} = require('../ops/obsidian-livesync/scripts/obsidian-glossary-publisher');

describe('obsidian sources publisher', () => {
  it('round-trips a source through Markdown', () => {
    const raw = sourceMarkdown({
      id: 'docker-compose',
      status: 'publish',
      entry: {
        title: 'Compose file reference',
        publisher: 'Docker Docs',
        url: 'https://docs.docker.com/reference/compose-file/',
        accessed_at: '2026-08-28'
      }
    });

    const meta = parseFrontmatter(raw);
    expect(meta.type).toBe('source');
    expect(meta.id).toBe('docker-compose');
    expect(meta.status).toBe('publish');
    expect(sourceEntryFromFrontmatter(meta)).toEqual({
      id: 'docker-compose',
      entry: {
        title: 'Compose file reference',
        publisher: 'Docker Docs',
        url: 'https://docs.docker.com/reference/compose-file/',
        accessed_at: '2026-08-28'
      }
    });
  });

  it('creates deterministic file and branch names', () => {
    expect(sourceFileName('docker-compose')).toBe('docker-compose.md');
    expect(branchForSource('docker-compose')).toBe('obsidian-source/docker-compose');
  });

  it('rejects invalid source metadata', () => {
    expect(() => sourceEntryFromFrontmatter({
      id: '../docker',
      title: 'Docker',
      publisher: 'Docker Docs',
      url: 'https://docs.docker.com/'
    })).toThrow('Invalid source id');

    expect(() => sourceEntryFromFrontmatter({
      id: 'docker',
      title: 'Docker',
      publisher: 'Docker Docs',
      url: 'ftp://example.com'
    })).toThrow('valid HTTP(S) URL');

    expect(() => sourceEntryFromFrontmatter({
      id: 'docker',
      title: 'Docker',
      publisher: 'Docker Docs',
      url: 'https://docs.docker.com/',
      accessed_at: '28.08.2026'
    })).toThrow('YYYY-MM-DD');
  });

  it('accepts HTTP and HTTPS source URLs', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
    expect(isValidHttpUrl('http://example.com')).toBe(true);
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
  });
});
