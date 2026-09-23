const {
  candidateTable,
  rawGithubUrl,
  renderReport,
  selectedFromPost
} = require('../scripts/render-cover-review');

describe('cover review markdown', () => {
  const report = {
    postPath: 'posts/example.md',
    title: 'Example Article',
    series: 'example-series',
    visualIntent: 'writing-proofreading',
    visualIntentEvidence: 22,
    semanticModel: 'Xenova/multilingual-e5-small',
    semanticWeight: 0.82,
    query: 'server storage cloud',
    queries: ['server storage cloud', 'Self-Hosting Nextcloud WebDAV', 'Example Article'],
    selected: {
      rank: 1,
      score: 88,
      tags: 'server, storage, cloud',
      user: 'Example',
      pageURL: 'https://pixabay.com/photos/example-42/',
      coverImage: '/assets/covers/example.jpg'
    },
    candidates: [
      {
        rank: 1,
        score: 88,
        heuristicScore: 61,
        semanticSimilarity: 0.87321,
        tags: 'server, storage, cloud',
        user: 'Example',
        pageURL: 'https://pixabay.com/photos/example-42/',
        previewURL: 'https://cdn.example.test/preview-1.jpg',
        searchQueries: ['server storage cloud', 'Self-Hosting Nextcloud WebDAV'],
        reasons: ['+24 direct: server, storage', '+10 hero aspect']
      },
      {
        rank: 2,
        score: 67,
        tags: 'network, datacenter',
        user: 'Second',
        pageURL: 'https://pixabay.com/photos/example-43/',
        previewURL: 'https://cdn.example.test/preview-2.jpg',
        reasons: ['+10 topic: network, datacenter']
      }
    ]
  };

  it('builds a stable raw GitHub URL for the locally committed cover', () => {
    expect(rawGithubUrl(
      '0b-ivan/Blog',
      'abc123',
      '/assets/covers/example image.jpg'
    )).toBe(
      'https://raw.githubusercontent.com/0b-ivan/Blog/abc123/assets/covers/example%20image.jpg'
    );
  });

  it('renders the selected local cover and ranked candidates in the PR body', () => {
    const markdown = renderReport(report, {
      repository: '0b-ivan/Blog',
      commit: 'abc123',
      selectionByPost: new Map([[
        'posts/example.md',
        {
          postPath: 'posts/example.md',
          motif: 'storage',
          baseScore: 88,
          adjustedScore: 76,
          diversityPenalty: 12,
          sameSeriesReuse: false,
          forcedDuplicate: false,
          reasons: ['-12 motif diversity: storage already used by 1 unrelated article(s)']
        }
      ]])
    });

    expect(markdown).toContain('![Cover-Vorschau: Example Article]');
    expect(markdown).toContain('raw.githubusercontent.com/0b-ivan/Blog/abc123/assets/covers/example.jpg');
    expect(markdown).toContain('88/100');
    expect(markdown).toContain('**Serie:** `example-series`');
    expect(markdown).toContain('**Bildidee:** `writing-proofreading`');
    expect(markdown).toContain('**Intent-Evidenz:** 22');
    expect(markdown).toContain('**Semantisches Ranking:** `Xenova/multilingual-e5-small` · E5 82%');
    expect(markdown).toContain('E5: 0.8732');
    expect(markdown).toContain('Heuristik: 61/100');
    expect(markdown).toContain('**Vielfalt:** Motiv `storage` · Score 88 → 76');
    expect(markdown).toContain('außerhalb von Serien eindeutig');
    expect(markdown).toContain('motif diversity');
    expect(markdown).toContain('Pixabay-Suchpfade');
    expect(markdown).toContain('Self-Hosting Nextcloud WebDAV');
    expect(markdown).toContain('Suchpfad: server storage cloud · Self-Hosting Nextcloud WebDAV');
    expect(markdown).toContain('Top-3-Kandidaten');
    expect(markdown).toContain('https://cdn.example.test/preview-1.jpg');
    expect(markdown).toContain('https://pixabay.com/photos/example-42/');
  });

  it('recovers the selected semantic candidate from updated post frontmatter', () => {
    const candidateReport = {
      ...report,
      selected: undefined,
      candidates: [
        {
          rank: 1,
          id: '42',
          score: 93,
          heuristicScore: 61,
          semanticSimilarity: 0.90123,
          tags: 'writing, text, document',
          pageURL: 'https://pixabay.com/photos/example-42/'
        }
      ]
    };
    const raw = `---
title: Example Article
cover_provider: pixabay
cover_provider_id: "42"
cover_image: /assets/covers/example.jpg
cover_score: 93
---

Body
`;

    const selected = selectedFromPost(candidateReport, raw);
    expect(selected.id).toBe('42');
    expect(selected.coverImage).toBe('/assets/covers/example.jpg');
    expect(selected.score).toBe(93);
    expect(selected.semanticSimilarity).toBe(0.90123);
  });

  it('renders a compact candidate comparison table', () => {
    const markdown = candidateTable(report.candidates, { compact: true });
    expect(markdown).toContain('| Rang | Score | Vorschau | Details |');
    expect(markdown).toContain('88/100');
    expect(markdown).toContain('67/100');
    expect(markdown).toContain('[Vorschau](https://cdn.example.test/preview-1.jpg)');
    expect(markdown).not.toContain('<img');
  });

  it('keeps batch review compact while preserving the selected local cover', () => {
    const markdown = renderReport(report, {
      repository: '0b-ivan/Blog',
      commit: 'abc123',
      compact: true,
      selectionByPost: new Map()
    });

    expect(markdown).toContain('![Cover-Vorschau: Example Article]');
    expect(markdown).not.toContain('Pixabay-Suchpfade');
    expect(markdown).toContain('[Vorschau](https://cdn.example.test/preview-1.jpg)');
    expect(markdown).not.toContain('Bewertung:');
  });
});
