const {
  buildGraphData,
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
