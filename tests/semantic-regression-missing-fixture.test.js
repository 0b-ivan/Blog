const fs = require('node:fs/promises');
const path = require('node:path');

describe('semantic regression missing fixture guard', () => {
  it('skips fixture queries in the search loop when the fixture is missing', async () => {
    const source = await fs.readFile(
      path.join(__dirname, '..', 'rag', 'regression', 'search-regression.node.js'),
      'utf8'
    );

    expect(source).toContain('if (!fixture) {\n        continue;\n      }');
  });
});
