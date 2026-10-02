const { execFileSync } = require('node:child_process');

const contentPath = /^(posts\/|archive\/|post-history\/|snippets\/|assets\/posts\/|assets\/covers\/|assets\/css\/article-covers\.css$|media\/photos\/)/;
const publicationPath = /^(posts\/[^/]+\.md$|posts\/_sources\.json$|archive\/[^/]+\.md$|snippets\/|assets\/posts\/|assets\/covers\/|assets\/css\/article-covers\.css$|media\/photos\/)/;

function validateProductionPR({ base, head, headRepository, repository, files }) {
  if (base !== 'main') return;
  if (headRepository !== repository) throw new Error('Production PRs must come from this repository.');
  const articles = new Set(files.map(({ path }) => path.match(/^(?:posts|archive)\/([^/]+\.md)$/)?.[1]).filter(Boolean));
  if (/^publication\/[^/]+$/.test(head)) {
    if (articles.size !== 1 || files.some(({ path }) => !publicationPath.test(path))) {
      throw new Error('Article Publication must contain exactly one article and only publication assets.');
    }
    return;
  }
  if (/^obsidian-unpublish\/main\/[^/]+$/.test(head)) {
    if (articles.size !== 1 || files.some(({ path, status }) => !/^(posts|archive)\/[^/]+\.md$/.test(path) || status !== 'D')) {
      throw new Error('Production Unpublish may only delete one article from posts/archive.');
    }
    return;
  }
  if (/^release\/v\d+\.\d+\.\d+$/.test(head)) {
    if (!files.some(({ path }) => path === 'VERSION') || files.some(({ path }) => contentPath.test(path) || path.startsWith('infra/kubernetes/staging/'))) {
      throw new Error('Software Release must update VERSION and must not include Publication/Staging-only files.');
    }
    return;
  }
  throw new Error('Feature/fix PRs must target staging. Use Article Publication or Software Release to promote to main.');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

if (require.main === module) {
  try {
    const [base, head, headRepository, repository, baseSha] = process.argv.slice(2);
    if (!base) throw new Error('Missing PR metadata.');
    if (base === 'main') {
      // Disable rename detection so archive moves count as delete + add.
      const fields = git('diff', '--no-renames', '--name-status', '-z', `${baseSha}...HEAD`).split('\0');
      const files = [];
      for (let i = 0; i + 1 < fields.length; i += 2) files.push({ status: fields[i], path: fields[i + 1] });
      validateProductionPR({ base, head, headRepository, repository, files });
      if (head.startsWith('release/')) {
        if (git('show', 'HEAD:VERSION') !== head.slice('release/v'.length)) throw new Error('Release branch and VERSION do not match.');
        // Frozen releases may use an older staging version. Require every new
        // workflow blob to exist in staging history rather than just its latest head.
        for (const { path, status } of files) {
          if (!path.startsWith('.github/workflows/') || status === 'D') continue;
          const blob = git('rev-parse', `HEAD:${path}`);
          const commits = git('rev-list', 'origin/staging', '--', path).split('\n').filter(Boolean);
          const known = commits.some(sha => git('ls-tree', sha, '--', path).split(/\s+/)[2] === blob);
          if (!known) throw new Error(`Workflow ${path} has not passed through staging.`);
        }
      }
    }
    console.log(`Branch flow accepted: ${head} -> ${base}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateProductionPR };
