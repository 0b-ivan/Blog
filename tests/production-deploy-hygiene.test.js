const fs = require('node:fs');
const path = require('node:path');

describe('production deploy hygiene', () => {
  const root = path.resolve(__dirname, '..');

  it('publishes the blog only on localhost (Cloudflare Tunnel is the public entry)', () => {
    const compose = fs.readFileSync(path.join(root, 'docker-compose.prod.yml'), 'utf8');
    const blogSection = compose.split(/\n {2}blog:\n/)[1];

    expect(blogSection).toContain('- "127.0.0.1:1888:8080"');
    expect(compose).not.toMatch(/- "1888:8080"/);
  });

  it('removes old SHA-tagged images after a successful full deploy', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'cd.yml'),
      'utf8'
    );

    expect(workflow).toContain('prune_old_images() {');
    expect(workflow).toContain('prune_old_images "${BLOG_IMAGE%:*}" "$BLOG_IMAGE" "$PREVIOUS_BLOG_IMAGE"');
    expect(workflow).toContain('prune_old_images "${SEARCH_IMAGE%:*}" "$SEARCH_IMAGE" "$PREVIOUS_SEARCH_IMAGE"');
    expect(workflow).toContain('prune_old_images "${PDF_IMAGE%:*}" "$PDF_IMAGE" "$PREVIOUS_PDF_IMAGE"');
    expect(workflow.indexOf('prune_old_images "${BLOG_IMAGE%:*}"')).toBeGreaterThan(
      workflow.indexOf("rollback_deployment 'Kernel Grep returned results for the noise query'")
    );
  });
});
