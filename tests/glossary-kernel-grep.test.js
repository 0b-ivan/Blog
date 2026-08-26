const { glossaryEntries } = require('../lib/glossary');

describe('Kernel Grep glossary coverage', () => {
  it('loads all suggested Kernel Grep terms', () => {
    const keys = new Set(glossaryEntries.map((entry) => entry.key));
    const expected = [
      'Search-Service',
      'Artikel-Metadaten',
      'Code-Fences',
      'Content-Änderungen',
      'Fließkomma-Vektoren',
      'GET',
      'LIST',
      'Live-Suche',
      'POST',
      'Submit-Button',
      'Terminal-Overlay'
    ];

    for (const key of expected) {
      expect(keys.has(key), `missing glossary key: ${key}`).toBe(true);
    }
  });
});
