const {
  renderPostPage,
  renderRelatedPosts
} = require('../server');

function tags(count) {
  return Array.from({ length: count }, (_value, index) => `Tag${index + 1}`);
}

describe('post tag rendering', () => {
  it('shows up to ten tags on the post detail page', () => {
    const html = renderPostPage({
      title: 'Tag Test',
      date: '2026-08-21',
      category: 'DevOps',
      tags: tags(12),
      excerpt: 'Excerpt',
      html: '<p>Body</p>'
    });

    expect(html.match(/class="tag-chip"/g) || []).toHaveLength(10);
    expect(html).toContain('>Tag1<');
    expect(html).toContain('>Tag10<');
    expect(html).not.toContain('>Tag11<');
    expect(html).not.toContain('>Tag12<');
  });

  it('uses the same ten-tag limit for related post cards', () => {
    const html = renderRelatedPosts([
      {
        slug: 'related',
        title: 'Related',
        date: '2026-08-21',
        category: 'DevOps',
        tags: tags(12),
        excerpt: 'Related excerpt'
      }
    ]);

    expect(html.match(/class="tag-chip"/g) || []).toHaveLength(10);
    expect(html).toContain('>Tag10<');
    expect(html).not.toContain('>Tag11<');
  });
});
