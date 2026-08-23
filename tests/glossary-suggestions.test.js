const {
  COMMENT_MARKER,
  renderMarkdownReport,
  suggestGlossaryTerms
} = require('../lib/glossary-suggestions');
const {
  parseOptions,
  renderReport
} = require('../scripts/suggest-glossary-terms');

describe('glossary suggestions', () => {
  const entries = [
    {
      key: 'VPC',
      aliases: ['AWS VPC']
    },
    {
      key: 'GraphRAG',
      aliases: []
    }
  ];

  it('suggests high-confidence technical tokens and contextual product names', () => {
    const markdown = [
      '---',
      'title: Test',
      '---',
      '',
      'Die VPC bleibt ein bekannter Begriff.',
      'Für das Ranking testen wir RRF zusammen mit OpenTelemetry.',
      'Wir deployen mit Kubernetes.',
      'GraphRAG ist ebenfalls schon gepflegt.'
    ].join('\n');

    const suggestions = suggestGlossaryTerms(markdown, {
      entries,
      file: 'posts/test.md'
    });
    const byTerm = new Map(suggestions.map((entry) => [entry.term, entry]));

    expect(byTerm.has('VPC')).toBe(false);
    expect(byTerm.has('GraphRAG')).toBe(false);
    expect(byTerm.get('RRF')?.confidence).toBe('high');
    expect(byTerm.get('OpenTelemetry')?.confidence).toBe('high');
    expect(byTerm.get('Kubernetes')?.confidence).toBe('medium');
    expect(byTerm.get('Kubernetes')?.occurrences[0]).toMatchObject({
      file: 'posts/test.md',
      line: 7
    });
  });

  it('ignores frontmatter, managed glossary definitions, inline code and fenced code', () => {
    const markdown = [
      '---',
      'title: SECRETAPI',
      '---',
      '',
      'Inline `InlineSDK` bleibt unberücksichtigt.',
      '',
      '```text',
      'HIDDENAPI OpenCodeThing',
      '```',
      '',
      'Sichtbar bleibt NEWAPI.',
      '',
      '<!-- glossary:start -->',
      '*[MANAGEDAPI]: Managed API',
      '<!-- glossary:end -->'
    ].join('\n');

    const terms = new Set(suggestGlossaryTerms(markdown, { entries, file: 'posts/test.md' })
      .map((entry) => entry.term));

    expect(terms.has('SECRETAPI')).toBe(false);
    expect(terms.has('InlineSDK')).toBe(false);
    expect(terms.has('HIDDENAPI')).toBe(false);
    expect(terms.has('OpenCodeThing')).toBe(false);
    expect(terms.has('MANAGEDAPI')).toBe(false);
    expect(terms.has('NEWAPI')).toBe(true);
  });

  it('honors the persistent ignore list', () => {
    const suggestions = suggestGlossaryTerms('RRF und OpenTelemetry werden getestet.', {
      entries,
      ignoredTerms: ['RRF'],
      file: 'posts/test.md'
    });

    expect(suggestions.some((entry) => entry.term === 'RRF')).toBe(false);
    expect(suggestions.some((entry) => entry.term === 'OpenTelemetry')).toBe(true);
  });

  it('renders one stable, non-blocking PR report', () => {
    const suggestions = suggestGlossaryTerms('Wir testen RRF.', {
      entries,
      file: 'posts/test.md'
    });
    const report = renderMarkdownReport(suggestions, { scannedFiles: 1 });

    expect(report).toContain(COMMENT_MARKER);
    expect(report).toContain('## Glossar-Vorschläge');
    expect(report).toContain('**nicht blockierend**');
    expect(report).toContain('`RRF`');
    expect(report).toContain('config/glossary-suggestion-ignore.json');
  });

  it('renders a clean success report when no candidate remains', () => {
    const report = renderReport([], 'markdown', 2);

    expect(report).toContain(COMMENT_MARKER);
    expect(report).toContain('Geprüfte Artikel: **2**');
    expect(report).toContain('Keine neuen Fachbegriffe');
  });

  it('parses CLI output options without changing the non-blocking behavior', () => {
    expect(parseOptions([
      '--format', 'markdown',
      '--output', '/tmp/report.md',
      'posts/a.md',
      'posts/b.md'
    ])).toEqual({
      files: ['posts/a.md', 'posts/b.md'],
      format: 'markdown',
      output: '/tmp/report.md'
    });
  });
});
