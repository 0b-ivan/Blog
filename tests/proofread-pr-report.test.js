const {
  parseCSpell,
  parseLanguageTool,
  renderReport
} = require('../scripts/build-proofread-pr-report');

describe('proofreading PR report', () => {
  it('parses CSpell findings', () => {
    const findings = parseCSpell(
      'posts/test.md:12:7 - Unknown word (technolgie) Suggestions: [technologie, Technologie]\n'
    );

    expect(findings).toEqual([
      {
        file: 'posts/test.md',
        line: 12,
        column: 7,
        word: 'technolgie',
        suggestions: ['technologie', 'Technologie']
      }
    ]);
  });

  it('parses LanguageTool findings with text and suggestion', () => {
    const findings = parseLanguageTool([
      'posts/test.md:20:97 [UPPERCASE_SENTENCE_START/typographical] Dieser Satz fängt nicht mit einem großgeschriebenen Wort an.',
      '  Text: "die"',
      '  Vorschlag: Die'
    ].join('\n'));

    expect(findings).toEqual([
      {
        file: 'posts/test.md',
        line: 20,
        column: 97,
        rule: 'UPPERCASE_SENTENCE_START/typographical',
        message: 'Dieser Satz fängt nicht mit einem großgeschriebenen Wort an.',
        text: '"die"',
        suggestion: 'Die'
      }
    ]);
  });

  it('renders concrete findings in the PR report', () => {
    const report = renderReport({
      checkedFiles: ['posts/test.md'],
      cspell: [
        {
          file: 'posts/test.md',
          line: 12,
          column: 7,
          word: 'technolgie',
          suggestions: ['Technologie']
        }
      ],
      languageTool: [
        {
          file: 'posts/test.md',
          line: 20,
          column: 97,
          message: 'Satzanfang großschreiben.',
          text: '"die"',
          suggestion: 'Die'
        }
      ]
    });

    expect(report).toContain('technolgie');
    expect(report).toContain('Technologie');
    expect(report).toContain('Satzanfang großschreiben.');
    expect(report).toContain('posts/test.md:20:97');
  });
});
