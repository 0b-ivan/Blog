const {
  candidateTable,
  rawGithubUrl,
  renderReport
} = require('../scripts/render-cover-review');

describe('cover review markdown', () => {
  const report = {
    postPath: 'posts/example.md',
    title: 'Example Article',
    query: 'server storage cloud',
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
        tags: 'server, storage, cloud',
        user: 'Example',
        pageURL: 'https://pixabay.com/photos/example-42/',
        previewURL: 'https://cdn.example.test/preview-1.jpg',
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
      commit: 'abc123'
    });

    expect(markdown).toContain('![Cover-Vorschau: Example Article]');
    expect(markdown).toContain('raw.githubusercontent.com/0b-ivan/Blog/abc123/assets/covers/example.jpg');
    expect(markdown).toContain('88/100');
    expect(markdown).toContain('Top-3-Kandidaten');
    expect(markdown).toContain('https://cdn.example.test/preview-1.jpg');
    expect(markdown).toContain('https://pixabay.com/photos/example-42/');
  });

  it('renders a compact candidate comparison table', () => {
    const markdown = candidateTable(report.candidates);
    expect(markdown).toContain('| Rang | Score | Vorschau | Details |');
    expect(markdown).toContain('88/100');
    expect(markdown).toContain('67/100');
  });
});
