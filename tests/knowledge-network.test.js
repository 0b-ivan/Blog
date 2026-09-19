const {
  buildGraphData,
  filterGraphData,
  limitSemanticLinks,
  semanticLinkLabel
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

  it('combines articles, recurring tags, categories and semantic edges', () => {
    const graph = buildGraphData(posts, [
      {
        source: 'docker-compose',
        target: 'docker-deployment',
        similarity: 0.91,
        semanticLift: 0.08,
        relationScore: 1.04,
        sharedTags: ['Docker'],
        sameCategory: true
      }
    ]);

    expect(graph.nodes.filter((node) => node.type === 'article')).toHaveLength(3);
    expect(graph.nodes.some((node) => node.id === 'tag:docker')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'tag:rss')).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'category:container')).toBe(true);

    const semantic = graph.links.find((link) => link.type === 'semantic');
    expect(semantic).toMatchObject({
      score: 1.04,
      similarity: 0.91,
      semanticLift: 0.08,
      sharedTags: ['Docker'],
      sameCategory: true
    });
  });

  it('limits semantic clutter for compact views', () => {
    const links = [
      { source: 'post:a', target: 'post:b', type: 'semantic', score: 0.98 },
      { source: 'post:a', target: 'post:c', type: 'semantic', score: 0.94 },
      { source: 'post:a', target: 'post:d', type: 'semantic', score: 0.82 },
      { source: 'post:b', target: 'post:c', type: 'semantic', score: 0.8 },
      { source: 'post:a', target: 'tag:docker', type: 'tag' }
    ];

    const limited = limitSemanticLinks(links, 2);
    const semantic = limited.filter((link) => link.type === 'semantic');
    const degree = new Map();
    semantic.forEach((link) => {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    });

    expect(semantic).toHaveLength(3);
    expect(semantic.map((link) => link.score)).toEqual([0.98, 0.94, 0.8]);
    expect(semantic.some((link) => link.score === 0.82)).toBe(false);
    expect(Math.max(...degree.values())).toBeLessThanOrEqual(2);
    expect(limited.some((link) => link.type === 'tag')).toBe(true);
  });

  it('can hide graph layers without removing article nodes', () => {
    const graph = buildGraphData(posts, [{
      source: 'docker-compose',
      target: 'docker-deployment',
      similarity: 0.91
    }]);
    const filtered = filterGraphData(graph, { semantic: false, tags: false, categories: true });

    expect(filtered.nodes.filter((node) => node.type === 'article')).toHaveLength(3);
    expect(filtered.nodes.some((node) => node.type === 'tag')).toBe(false);
    expect(filtered.nodes.some((node) => node.type === 'category')).toBe(true);
    expect(filtered.links.some((link) => link.type === 'semantic')).toBe(false);
    expect(filtered.links.some((link) => link.type === 'tag')).toBe(false);
  });

  it('renders explainable semantic edge labels without exposing embeddings', () => {
    const label = semanticLinkLabel({
      type: 'semantic',
      similarity: 0.91337,
      sharedTags: ['Docker'],
      sameCategory: true
    });

    expect(label).toContain('Vektorähnlichkeit 0.913');
    expect(label).toContain('Tags: Docker');
    expect(label).toContain('gleiche Kategorie');
    expect(label).not.toContain('embedding');
  });
});
