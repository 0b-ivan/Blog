const { validateProductionPR } = require('../scripts/check-production-pr');

const metadata = { base: 'main', repository: 'owner/blog', headRepository: 'owner/blog' };
const file = (path, status = 'M') => ({ path, status });
const validate = (head, files, extra = {}) => validateProductionPR({ ...metadata, head, files, ...extra });

describe('production branch flow', () => {
  it('routes feature/fix and dependency changes through staging', () => {
    for (const head of ['fix/livesync', 'feature/search', 'dependabot/npm']) {
      expect(() => validate(head, [file('server.js')])).toThrow('must target staging');
      expect(() => validate(head, [file('server.js')], { base: 'staging' })).not.toThrow();
    }
  });

  it('allows one article with assets, including an archive move', () => {
    expect(() => validate('publication/pokemon', [file('posts/pokemon.md', 'A'), file('archive/pokemon.md', 'D'), file('assets/posts/pokemon.png', 'A')])).not.toThrow();
  });

  it('rejects publications containing multiple articles or software changes', () => {
    expect(() => validate('publication/pokemon', [file('posts/pokemon.md'), file('posts/doom.md')])).toThrow();
    expect(() => validate('publication/pokemon', [file('posts/pokemon.md'), file('VERSION')])).toThrow();
    expect(() => validate('publication/pokemon', [file('.github/workflows/ci.yml')])).toThrow();
  });

  it('allows semver releases with a version bump but rejects mixed content releases', () => {
    expect(() => validate('release/v2.2.4', [file('VERSION'), file('server.js')])).not.toThrow();
    expect(() => validate('release/v2.2.4', [file('server.js')])).toThrow();
    expect(() => validate('release/v2.2.4', [file('VERSION'), file('posts/pokemon.md')])).toThrow();
    expect(() => validate('release/v2.2.4', [file('VERSION'), file('infra/kubernetes/staging/kustomization.yaml')])).toThrow();
    expect(() => validate('release/not-a-version', [file('VERSION')])).toThrow();
  });

  it('preserves the direct production unpublish path, restricted to article deletions', () => {
    expect(() => validate('obsidian-unpublish/main/pokemon', [file('posts/pokemon.md', 'D'), file('archive/pokemon.md', 'D')])).not.toThrow();
    expect(() => validate('obsidian-unpublish/main/pokemon', [file('posts/pokemon.md')])).toThrow();
    expect(() => validate('obsidian-unpublish/main/pokemon', [file('server.js', 'D')])).toThrow();
  });

  it('rejects production candidates from another repository', () => {
    expect(() => validate('release/v2.2.4', [file('VERSION')], { headRepository: 'fork/blog' })).toThrow();
  });
});
