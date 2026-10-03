const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateProductionPR } = require('../scripts/check-production-pr');

const metadata = { base: 'main', repository: 'owner/blog', headRepository: 'owner/blog' };
const file = (path, status = 'M') => ({ path, status });
const validate = (head, files, extra = {}) => validateProductionPR({ ...metadata, head, files, ...extra });
const workflowPath = '.github/workflows/ci.yml';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

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

  it('accepts frozen workflow versions hidden by a staging merge and rejects unknown versions', () => {
    const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'production-pr-policy-'));
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-production-pr.js');
    const write = (name, contents) => {
      const target = path.join(repositoryPath, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    };
    const commit = message => {
      git(repositoryPath, 'add', '.');
      git(repositoryPath, 'commit', '-m', message);
      return git(repositoryPath, 'rev-parse', 'HEAD');
    };
    let mainSha;
    const runPolicy = candidateSha => execFileSync(process.execPath, [
      scriptPath, 'main', 'release/v2.0.0', 'owner/blog', 'owner/blog', mainSha, candidateSha
    ], { cwd: repositoryPath, encoding: 'utf8' });

    try {
      git(repositoryPath, 'init', '-b', 'main');
      git(repositoryPath, 'config', 'user.name', 'Test');
      git(repositoryPath, 'config', 'user.email', 'test@example.com');
      write('VERSION', '1.9.9\n');
      write(workflowPath, 'base workflow\n');
      commit('base');
      const baseSha = git(repositoryPath, 'rev-parse', 'HEAD');

      git(repositoryPath, 'checkout', '-b', 'hidden-staging-version', baseSha);
      write(workflowPath, 'staging-only workflow\n');
      const hiddenWorkflowSha = commit('staging-only workflow version');

      git(repositoryPath, 'checkout', 'main');
      write(workflowPath, 'main workflow\n');
      mainSha = commit('main workflow version');
      git(repositoryPath, 'merge', '--no-ff', '-s', 'ours', 'hidden-staging-version', '-m', 'merge staging history');
      const stagingMergeSha = git(repositoryPath, 'rev-parse', 'HEAD');
      git(repositoryPath, 'update-ref', 'refs/remotes/origin/staging', stagingMergeSha);

      write('VERSION', '2.0.0\n');
      write(workflowPath, 'staging-only workflow\n');
      const frozenReleaseSha = commit('frozen release');
      expect(git(repositoryPath, 'rev-parse', `${hiddenWorkflowSha}:${workflowPath}`))
        .toBe(git(repositoryPath, 'rev-parse', `${frozenReleaseSha}:${workflowPath}`));
      expect(runPolicy(frozenReleaseSha)).toContain('Branch flow accepted');

      write(workflowPath, 'unknown workflow\n');
      const unknownReleaseSha = commit('unknown workflow release');
      expect(() => runPolicy(unknownReleaseSha)).toThrow(/has not passed through staging/);
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  });
});
