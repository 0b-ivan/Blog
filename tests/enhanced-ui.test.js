const {
  tagUrl,
  filterPostsByTag,
  versionFooter,
  decoratePostHtml,
  renderTagIndex
} = require('../enhanced-server');

describe('enhanced article UI', () => {
  it('builds shareable tag URLs and filters tags case-insensitively', () => {
    expect(tagUrl('CI/CD')).toBe('/tags/CI%2FCD');

    const posts = [
      { title: 'One', tags: ['Docker', 'DevOps'] },
      { title: 'Two', tags: ['Linux'] }
    ];

    expect(filterPostsByTag(posts, 'docker')).toEqual([posts[0]]);
    expect(filterPostsByTag(posts, 'DOCKER')).toEqual([posts[0]]);
    expect(filterPostsByTag(posts, 'missing')).toEqual([]);
  });

  it('renders current and historical version footer states', () => {
    const manifest = { currentVersion: 8, status: 'published' };
    const current = versionFooter('example', manifest);
    const historical = versionFooter('example', manifest, { viewingVersion: 2 });

    expect(current).toContain('post-version-footer');
    expect(current).toContain('Artikelversion');
    expect(current).toContain('v8');
    expect(current).toContain('Aktuell');
    expect(historical).toContain('Historische Version');
    expect(historical).toContain('v2');
    expect(historical).toContain('Aktuelle Version v8');
  });

  it('places version information below the article and before related posts', () => {
    const html = '<html><head></head><body><article><h1>Post</h1><section class="terminal-post">Body</section><section class="related-posts">Related</section></article></body></html>';
    const decorated = decoratePostHtml(html, 'example', { currentVersion: 3, status: 'published' });

    expect(decorated.indexOf('terminal-post')).toBeLessThan(decorated.indexOf('post-version-footer'));
    expect(decorated.indexOf('post-version-footer')).toBeLessThan(decorated.indexOf('related-posts'));
    expect(decorated).toContain('/assets/tag-navigation.js');
  });

  it('renders a tag result page with matching post links', () => {
    const html = renderTagIndex('Docker', [{
      slug: 'docker-post',
      title: 'Docker Post',
      category: 'DevOps',
      date: '2026-08-21',
      excerpt: 'Example',
      tags: ['Docker', 'CI/CD']
    }]);

    expect(html).toContain('class="history-panel tag-results"');
    expect(html).toContain('/posts/docker-post');
    expect(html).toContain('/tags/CI%2FCD');
  });
});
