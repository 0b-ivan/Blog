const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  sliceSnippet,
  codeFence,
  expandSnippetLinks,
  namespaceFootnotes
} = require('../scripts/build-ebook-full');

describe('ebook snippet embedding', () => {
  it('slices snippet ranges like the browser embed', () => {
    expect(sliceSnippet('one\ntwo\nthree\nfour', '2-3')).toBe('two\nthree');
    expect(sliceSnippet('one\ntwo', '')).toBe('one\ntwo');
  });

  it('chooses a fence longer than backtick runs in source code', () => {
    expect(codeFence('const x = `value`;')).toBe('```');
    expect(codeFence('```nested```')).toBe('````');
  });

  it('embeds referenced snippet files into ebook markdown', async () => {
    const snippetsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-ebook-'));
    try {
      await fs.mkdir(path.join(snippetsDir, 'post'), { recursive: true });
      await fs.writeFile(path.join(snippetsDir, 'post', 'demo.sh'), 'echo one\necho two\necho three\n', 'utf8');

      const result = await expandSnippetLinks(
        '[Demo](/snippets/post/demo.sh "snippet:bash:2-3")',
        { snippetsDir, siteUrl: 'https://blog.obivan.org' }
      );

      expect(result).toContain('**Demo**');
      expect(result).toContain('_bash · Zeilen 2-3_');
      expect(result).toContain('```bash\necho two\necho three\n```');
      expect(result).toContain('https://blog.obivan.org/snippets/#/post%2Fdemo.sh');
    } finally {
      await fs.rm(snippetsDir, { recursive: true, force: true });
    }
  });

  it('namespaces footnotes while leaving fenced code untouched', () => {
    const markdown = [
      'Text.[^note]',
      '',
      '[^note]: Erklärung',
      '',
      '```text',
      '[^note]',
      '```'
    ].join('\n');

    const result = namespaceFootnotes(markdown, '2026-post');
    expect(result).toContain('Text.[^2026-post-note]');
    expect(result).toContain('[^2026-post-note]: Erklärung');
    expect(result).toContain('```text\n[^note]\n```');
  });
});
