const {
  buildGraphData,
  mapWithConcurrency,
  mergeSemanticResults,
  semanticEdgeKey,
  semanticQuery
} = require('../assets/knowledge-network');

describe('global knowledge network', () => {
  const posts = [
    {
      slug: 'docker-compose',
      title: 'Docker Compose',
      category: 'Container',
      tags: ['Docker', 'Compose'],
      excerpt: 'Mehrere Container gemeinsam starten.'
    },
    {
      slug: 'docker-deployment',
      title: 'Docker Deployment',
      category: 'Container',
      tags: ['Docker', 'Deployment'],
      excerpt: 'Container auf einem Server deployen.'
    },
    {
      slug: 'rss-reader',
      title: 'RSS Reader',
      category: 'Self-Hosting',
      tags: ['RSS'],
      excerpt: 'Feeds selbst hosten.'
    }
  ];

  it('builds stable semantic queries from article metadata', () => {
    expect(semanticQuery(posts[0])).toContain('Docker Compose');
    expect(semanticQuery(posts[0])).toContain('Container');
    expect(semanticQuery(posts[0]).length).toBeLessThanOrEqual(280);
  });

  it('deduplicates bidirectional semantic relations and keeps the strongest score', () => {
    const edges = mergeSemanticResults(posts, {
      'docker-compose': [
        { slug: 'docker-deployment', score: 0.91 },
        { slug: 'docker-compose', score: 1 }
      ],
      'docker-deployment': [
        { slug: 'docker-compose', score: 0.94 },
        { slug: 'missing-post', score: 0.99 }
      ]
    });

    expect(semanticEdgeKey('docker-compose', 'docker-deployment')).toBe(
      semanticEdgeKey('docker-deployment', 'docker-compose')
    );
    expect(edges).toEqual([
      {
        source: 'docker-compose',
        target: 'docker-deployment',
        score: 0.94
      }
    ]);
  });

  it('combines articles, recurring tags, categories and semantic edges', () => {
    const graph = buildGraphData(posts, [
      { source: 'docker-compose', target: 'docker-deployment', score: 0.94 }
    ]);

    expect(graph.nodes.filter((node) => node.type === 'article')).toHaveLength(3);
    expect(graph.nodes.some((node) => node.id === 'tag:docker')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'tag:rss')).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'category:container')).toBe(true);
    expect(graph.links.some((link) => link.type === 'semantic' && link.score === 0.94)).toBe(true);
  });

  it('limits concurrent asynchronous workers while preserving output order', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });
});
