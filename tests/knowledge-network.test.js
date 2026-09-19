const {
  buildGraphData,
  filterGraphData,
  primarySemanticLinkKeys,
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

  it('selects primary compact-view links without deleting graph information', () => {
    const links = [
      { source: 'post:a', target: 'post:b', type: 'semantic', score: 0.98 },
      { source: 'post:a', target: 'post:c', type: 'semantic', score: 0.94 },
      { source: 'post:a', target: 'post:d', type: 'semantic', score: 0.82 },
      { source: 'post:b', target: 'post:c', type: 'semantic', score: 0.8 },
      { source: 'post:a', target: 'tag:docker', type: 'tag' }
    ];

    const primary = primarySemanticLinkKeys(links, 2);

    expect(primary.size).toBe(3);
    expect(links).toHaveLength(5);
    expect(links.filter((link) => link.type === 'semantic')).toHaveLength(4);
    expect(primary.has('post:a::post:b')).toBe(true);
    expect(primary.has('post:a::post:c')).toBe(true);
    expect(primary.has('post:a::post:d')).toBe(false);
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
