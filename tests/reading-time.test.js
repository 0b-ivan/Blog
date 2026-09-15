const { WORDS_PER_MINUTE, countWords, calculateReadingTime } = require('../lib/reading-time');

describe('reading time', () => {
  it('counts article prose but excludes fenced and indented code', () => {
    const markdown = `${'Wort '.repeat(219)}\n\n\`\`\`js\n${'code '.repeat(500)}\n\`\`\`\n\n    ${'code '.repeat(500)}`;
    expect(countWords(markdown)).toBe(219);
    expect(calculateReadingTime(markdown)).toBe(1);
  });

  it('rounds up at 220 words per minute', () => {
    expect(WORDS_PER_MINUTE).toBe(220);
    expect(calculateReadingTime('Wort '.repeat(220))).toBe(1);
    expect(calculateReadingTime('Wort '.repeat(221))).toBe(2);
  });

  it('returns at least one minute for empty content', () => {
    expect(calculateReadingTime('')).toBe(1);
  });
});
