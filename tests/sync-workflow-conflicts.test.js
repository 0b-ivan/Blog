const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { novelSyncWorkflows } = require('../scripts/check-sync-workflows');

describe('sync workflow versions in a real Git merge', () => {
  let directory;
  let originalDirectory;
  const workflowPath = '.github/workflows/example.yml';
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = value => fs.writeFileSync(path.join(directory, workflowPath), value);
  const commit = message => { git('add', '-A'); git('commit', '-m', message); return git('rev-parse', 'HEAD'); };

  beforeEach(() => {
    originalDirectory = process.cwd();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-sync-'));
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    fs.mkdirSync(path.join(directory, '.github/workflows'), { recursive: true });
    write('name: base\n\n\n\n\n\n\n\n\n# tail: base\n');
    commit('base');
    git('branch', 'staging');
    process.chdir(directory);
  });

  afterEach(() => {
    process.chdir(originalDirectory);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('allows an unchanged workflow version imported from main', () => {
    write('name: main\n');
    commit('main-only workflow');
    git('switch', 'staging');
    fs.writeFileSync(path.join(directory, 'article.md'), 'staging article');
    commit('staging content');
    git('merge', '--no-ff', 'main', '-m', 'sync');
    expect(novelSyncWorkflows('staging^1', 'main', 'HEAD')).toEqual([]);
  });

  it('detects a third workflow version created even by staging-wins conflict resolution', () => {
    write('name: main\n\n\n\n\n\n\n\n\n# tail: main\n');
    commit('main changes both ends');
    git('switch', 'staging');
    write('name: staging\n\n\n\n\n\n\n\n\n# tail: base\n');
    const staging = commit('staging changes first hunk');
    git('merge', '--no-ff', '-X', 'ours', 'main', '-m', 'sync');
    expect(fs.readFileSync(path.join(directory, workflowPath), 'utf8')).toContain('# tail: main');
    expect(novelSyncWorkflows(staging, 'main', 'HEAD')).toEqual([workflowPath]);
  });

  it('allows a reviewed resolution retaining the entire staging workflow', () => {
    write('name: main\n');
    commit('main workflow');
    git('switch', 'staging');
    write('name: staging\n');
    const staging = commit('staging workflow');
    git('merge', '--no-ff', '-s', 'ours', 'main', '-m', 'reviewed resolution');
    expect(novelSyncWorkflows(staging, 'main', 'HEAD')).toEqual([]);
    git('merge-base', '--is-ancestor', 'main', 'HEAD');
  });
});
