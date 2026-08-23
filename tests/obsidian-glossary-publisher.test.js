const {
  StableTracker,
  branchForGlossary,
  glossaryConfigPath,
  glossaryDescription,
  glossaryFileName,
  glossaryMarkdown,
  parseAliases,
  parseFrontmatter,
  slugify
} = require('../ops/obsidian-livesync/scripts/obsidian-glossary-publisher');

describe('obsidian glossary publisher', () => {
  it('round-trips a glossary entry through Markdown', () => {
    const raw = glossaryMarkdown({
      term: 'VPC',
      section: 'platform',
      status: 'publish',
      entry: {
        full: 'Virtual Private Cloud',
        short: 'Logisch isoliertes virtuelles Netzwerk.',
        description: 'Eine VPC bildet einen eigenen Netzwerkbereich.',
        aliases: ['AWS VPC']
      }
    });

    const meta = parseFrontmatter(raw);
    expect(meta.type).toBe('glossary');
    expect(meta.term).toBe('VPC');
    expect(meta.section).toBe('platform');
    expect(meta.status).toBe('publish');
    expect(meta.aliases).toEqual(['AWS VPC']);
    expect(glossaryDescription(raw, 'VPC')).toBe(
      'Eine VPC bildet einen eigenen Netzwerkbereich.'
    );
  });

  it('tolerates a BOM and leading blank lines from Obsidian', () => {
    const meta = parseFrontmatter(
      '\uFEFF\n\n---\ntype: glossary\nterm: "RDS"\nstatus: draft\n---\n\n# RDS\n'
    );

    expect(meta.term).toBe('RDS');
    expect(meta.status).toBe('draft');
  });

  it('maps glossary sections to their canonical JSON files', () => {
    expect(glossaryConfigPath('base')).toBe('config/glossary.json');
    expect(glossaryConfigPath('security')).toBe('config/glossary/security.json');
    expect(() => glossaryConfigPath('../posts')).toThrow('Unknown glossary section');
  });

  it('creates deterministic file and branch names', () => {
    expect(slugify('CI/CD')).toBe('ci-cd');
    expect(glossaryFileName('CI/CD')).toBe('ci-cd.md');
    expect(branchForGlossary('CI/CD')).toBe('obsidian-glossary/ci-cd');
  });

  it('accepts JSON arrays and comma-separated aliases', () => {
    expect(parseAliases(['AWS VPC', 'AWS VPC'])).toEqual(['AWS VPC']);
    expect(parseAliases('AWS VPC, Virtual Network')).toEqual([
      'AWS VPC',
      'Virtual Network'
    ]);
  });

  it('waits for the same debounce window as article publishing', () => {
    const tracker = new StableTracker(300000);
    expect(tracker.observe('vpc.md', 'a', 0)).toBe(false);
    expect(tracker.observe('vpc.md', 'a', 300000)).toBe(true);
    tracker.markProcessed('vpc.md', 'a');
    expect(tracker.observe('vpc.md', 'a', 600000)).toBe(false);
  });
});
