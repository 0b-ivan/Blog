const {
  maskMarkdown,
  isIgnoredMatch,
  glossaryRanges,
  isGlossaryMatch,
  applySafeFixes,
  lineColumnAt
} = require('../scripts/proofread-posts');

describe('proofread-posts helpers', () => {
  it('masks frontmatter, fenced code, inline code and link targets without changing offsets', () => {
    const source = [
      '---',
      'title: "Feler im Titel"',
      '---',
      '',
      'Das ist ein Feler im Text.',
      '',
      '```bash',
      'echo Feler',
      '```',
      '',
      '`Feler` und [Dokumentation](https://example.com/Feler)',
      ''
    ].join('\n');

    const masked = maskMarkdown(source);

    expect(masked.length).toBe(source.length);
    expect(masked).toContain('Das ist ein Feler im Text.');
    expect(masked).not.toContain('Feler im Titel');
    expect(masked).not.toContain('echo Feler');
    expect(masked).not.toContain('https://example.com/Feler');
  });

  it('masks Markdown block quotes without disabling checks for normal prose', () => {
    const source = '> Da ist ein Weg. Nicht: Jeder darf durch.\n\nDas ist ein Feler.';
    const masked = maskMarkdown(source);
    expect(masked).not.toContain('Da ist ein Weg');
    expect(masked).toContain('Das ist ein Feler.');
    expect(masked).toHaveLength(source.length);
  });

  it('recognizes glossary terms and phrases at LanguageTool offsets', () => {
    const source = 'Ein Private Subnet nutzt ein NAT Gateway. VPCX bleibt unbekannt.';
    const ranges = glossaryRanges(source);
    expect(isGlossaryMatch({ offset: source.indexOf('Private'), length: 7 }, ranges)).toBe(true);
    expect(isGlossaryMatch({ offset: source.indexOf('NAT'), length: 3 }, ranges)).toBe(true);
    expect(isGlossaryMatch({ offset: source.indexOf('VPCX'), length: 4 }, ranges)).toBe(false);
  });

  it('applies only a unique safe spelling replacement', () => {
    const source = 'Das ist ein Feler. Das ist gut.';
    const offset = source.indexOf('Feler');
    const matches = [
      {
        offset,
        length: 5,
        message: 'Moeglicher Rechtschreibfehler',
        replacements: [{ value: 'Fehler' }],
        rule: { id: 'GERMAN_SPELLER_RULE', issueType: 'misspelling' }
      },
      {
        offset: source.indexOf('gut'),
        length: 3,
        message: 'Stilhinweis',
        replacements: [{ value: 'passend' }],
        rule: { id: 'STYLE_RULE', issueType: 'style' }
      }
    ];

    const result = applySafeFixes(source, matches, new Set());

    expect(result.text).toBe('Das ist ein Fehler. Das ist gut.');
    expect(result.applied).toHaveLength(1);
  });

  it('does not autocorrect configured technical terms', () => {
    const source = 'AWS ist hier absichtlich ein Fachbegriff.';
    const match = {
      offset: 0,
      length: 3,
      replacements: [{ value: 'ALS' }],
      rule: { id: 'GERMAN_SPELLER_RULE', issueType: 'misspelling' }
    };
    const ignoredWords = new Set(['aws']);

    expect(isIgnoredMatch(source, match, ignoredWords)).toBe(true);
    expect(applySafeFixes(source, [match], ignoredWords).applied).toHaveLength(0);
  });

  it('calculates one-based line and column positions', () => {
    expect(lineColumnAt('erste\nzweite\ndritte', 8)).toEqual({ line: 2, column: 3 });
  });
});
