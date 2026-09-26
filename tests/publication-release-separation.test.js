const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe('publication and release separation', () => {
  it('keeps article publication independent from software SemVer', () => {
    const prepare = read('.github/workflows/publish-article.yml');
    const publish = read('.github/workflows/publish-content-production.yml');
    const release = read('.github/workflows/release-production.yml');
    const production = read('.github/workflows/cd-k8s-production.yml');
    const kustomization = read('infra/kubernetes/production/kustomization.yaml');
    const contentDockerfile = read('Dockerfile.content');
    const reconciler = read('.github/workflows/production-pr-reconciler.yml');

    expect(prepare).toContain('A Publication must contain exactly one article');
    expect(prepare).toContain('Article Publication must never modify VERSION');
    expect(prepare).toContain('posts/_sources.json');
    expect(prepare).toContain('publication/${SLUG}');
    expect(prepare).toContain('--title "publish: ${TITLE}"');

    expect(publish).toContain('CONTENT_IMAGE_NAME: kernel-notes-content');
    expect(publish).toContain('Article Publication must not modify VERSION');
    expect(publish).toContain('posts/_sources.json');
    expect(publish).toContain('Production Publication must contain exactly one article');
    expect(publish).toContain('Dockerfile.content');
    expect(publish).toContain('kernel-notes-content');
    expect(publish).toContain('unchanged software version');

    expect(release).toContain('SemVer increment for this software release');
    expect(release).toContain('posts/*|archive/*|post-history/*|snippets/*|assets/posts/*|assets/covers/*');
    expect(release).toContain('Article/content files are deliberately excluded');
    expect(release).toContain('release: v${release_version}');

    expect(production).not.toContain("- 'posts/**'");
    expect(production).not.toContain("- 'archive/**'");
    expect(production).not.toContain("- 'snippets/**'");
    expect(production).toContain("!assets/posts/**");
    expect(production).toContain('CONTENT_IMAGE_NAME: kernel-notes-content');
    expect(production).toContain('Independent content runtime already exists; software Release will preserve its current content pin.');

    expect(kustomization).toContain('ghcr.io/0b-ivan/kernel-notes-content');
    expect(kustomization).toContain('content-blog-patch.yaml');
    expect(kustomization).toContain('content-search-patch.yaml');
    expect(kustomization).toContain('content-pdf-patch.yaml');

    expect(contentDockerfile).toContain('COPY posts ./posts');
    expect(contentDockerfile).toContain('COPY assets/posts ./assets/posts');
    expect(contentDockerfile).toContain('COPY assets/covers ./assets/covers');

    expect(reconciler).toContain('publication/');
    expect(reconciler).toContain('release/');
    expect(reconciler).toContain('gh workflow run ci.yml');
    expect(reconciler).not.toContain('promotion/staging-verified');
  });
});
