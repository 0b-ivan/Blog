const assert = require('node:assert/strict');
const test = require('node:test');
const { chunkMarkdown, embeddingText, splitIntoSections } = require('../lib/chunker');

test('splitIntoSections ignores markdown headings inside fenced code', () => {
  const markdown = `# Titel\n\nIntro\n\n## Abschnitt\n\n\`\`\`bash\n# kein Heading\necho ok\n\`\`\`\n\nDanach.`;
  const sections = splitIntoSections(markdown);

  assert.deepEqual(sections.map((section) => section.heading), ['Titel', 'Abschnitt']);
  assert.match(sections[1].content, /# kein Heading/);
});

test('chunkMarkdown keeps fenced code together and splits long sections on blocks', () => {
  const longParagraph = 'x'.repeat(420);
  const markdown = `## Test\n\n${longParagraph}\n\n\`\`\`js\nconst value = 42;\n\`\`\`\n\n${longParagraph}`;
  const chunks = chunkMarkdown(markdown, { maxChars: 500 });

  assert.equal(chunks.length, 3);
  assert.match(chunks[1].content, /const value = 42/);
  assert.ok(chunks.every((chunk) => chunk.contentHash.length === 64));
});

test('embeddingText adds title and section context', () => {
  assert.equal(
    embeddingText({ title: 'Docker', heading: 'Compose', content: 'Mehrere Container.' }),
    'Docker\n\nCompose\n\nMehrere Container.'
  );
});
