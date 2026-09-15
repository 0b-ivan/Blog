const { aggregateBlogStatistics } = require('../lib/blog-statistics');
const { publicationHeatmap, categoryRadar } = require('../assets/knowledge-network');

describe('blog statistics', () => {
  const posts = [
    { date: '2026-09-01', category: 'AWS', tags: ['Cloud', 'VPC'], wordCount: 440, readingTime: 2, html: '<abbr data-glossary-key="VPC">VPC</abbr>' },
    { date: '2026-09-01', category: 'AWS', tags: ['Cloud'], wordCount: 221, readingTime: 2, html: '<abbr data-glossary-key="AWS">AWS</abbr>' },
    { date: '2026-09-02', category: 'Linux', tags: ['systemd'], wordCount: 100, readingTime: 1, html: '<p>Text</p>' }
  ];

  it('aggregates content, glossary, topic and publication metrics', () => {
    const statistics = aggregateBlogStatistics(posts);
    expect(statistics).toMatchObject({
      articles: 3, words: 761, readingMinutes: 5, averageWords: 254,
      glossaryTerms: 2, categories: 2, tags: 3, busiestMonth: '2026-09',
      publicationDays: [{ date: '2026-09-01', count: 2 }, { date: '2026-09-02', count: 1 }]
    });
    expect(statistics.topicDistribution).toEqual([
      { label: 'Cloud & Infrastruktur', value: 2 },
      { label: 'Linux & Betrieb', value: 1 },
      { label: 'Container & Deployment', value: 0 },
      { label: 'Security & Netzwerke', value: 1 },
      { label: 'Entwicklung & Automation', value: 0 },
      { label: 'Self-Hosting & Daten', value: 0 }
    ]);
  });

  it('normalizes dates parsed from YAML into the publication heatmap', () => {
    const statistics = aggregateBlogStatistics([{ ...posts[0], date: new Date('2026-09-03T00:00:00Z') }]);
    expect(statistics.publicationDays).toEqual([{ date: '2026-09-03', count: 1 }]);
  });

  it('renders accessible heatmap and radar SVGs', () => {
    const heatmap = publicationHeatmap([{ date: '2026-09-01', count: 2 }], new Date('2026-09-15T00:00:00Z'));
    expect(heatmap.match(/class="heat-day/g)).toHaveLength(359);
    expect(heatmap).toContain('Heatmap der Veröffentlichungen');
    expect(heatmap).toContain('2 Veröffentlichungen im letzten Jahr');
    expect(heatmap).not.toContain('2026-09-16');
    expect(heatmap).toContain('Weniger');
    expect(heatmap).toContain('Mehr');
    expect(heatmap).toContain('>Mo<');
    expect(categoryRadar([{ label: 'Cloud', value: 4 }, { label: 'Betrieb', value: 3 }, { label: 'Security', value: 2 }])).toContain('Spinnendiagramm');
  });
});
