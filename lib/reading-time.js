const MarkdownIt = require('markdown-it');

const WORDS_PER_MINUTE = 220;
const markdown = new MarkdownIt({ html: false });

function countWords(markdownContent) {
  const tokens = markdown.parse(String(markdownContent || ''), {});
  const text = tokens
    .filter((token) => token.type !== 'fence' && token.type !== 'code_block')
    .flatMap((token) => token.children || [token])
    .filter((token) => token.type === 'text')
    .map((token) => token.content)
    .join(' ');

  return text.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function calculateReadingTime(markdownContent, wordsPerMinute = WORDS_PER_MINUTE) {
  const rate = Number.isFinite(wordsPerMinute) && wordsPerMinute > 0
    ? wordsPerMinute
    : WORDS_PER_MINUTE;

  return Math.max(1, Math.ceil(countWords(markdownContent) / rate));
}

module.exports = {
  WORDS_PER_MINUTE,
  countWords,
  calculateReadingTime
};
