const { execFileSync } = require('node:child_process');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function novelSyncWorkflows(staging, main, candidate) {
  const paths = git('diff', '--name-only', '--no-renames', '-z', staging, candidate, '--', '.github/workflows/').split('\0').filter(Boolean);
  const entry = (ref, path) => git('ls-tree', ref, '--', path);
  return paths.filter(path => {
    const proposed = entry(candidate, path);
    // Deletions do not introduce a new workflow blob.
    return proposed && proposed !== entry(staging, path) && proposed !== entry(main, path);
  });
}

if (require.main === module) {
  try {
    const refs = process.argv.slice(2);
    if (refs.length !== 3) throw new Error('Usage: check-sync-workflows.js STAGING MAIN CANDIDATE');
    const paths = novelSyncWorkflows(...refs);
    if (paths.length) {
      console.error('Back-sync would introduce newly merged workflow files:');
      console.error(paths.join('\n'));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = { novelSyncWorkflows };
