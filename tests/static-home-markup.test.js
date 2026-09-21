const fs = require('node:fs');
const path = require('node:path');

describe('static home page markup', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  it('does not render escaped newline text between HTML elements', () => {
    const markupWithoutInlineScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    expect(markupWithoutInlineScripts).not.toContain('\\n');
  });
});
