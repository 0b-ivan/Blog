const fs = require('node:fs');
const path = require('node:path');

describe('main to staging sync workflow', () => {
  it('continuously reconciles main history into the latest staging head', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'sync-main-to-staging.yml'),
      'utf8'
    );

    expect(workflow).toContain('- main');
    expect(workflow).toContain('- staging');
    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('SYNC_BRANCH: sync/main-to-staging');
    expect(workflow).toContain('git merge-base --is-ancestor "$MAIN_SHA" "$STAGING_SHA"');
    expect(workflow).toContain('git switch -C sync-candidate "$STAGING_SHA"');
    expect(workflow).toContain('git merge --no-ff --no-commit "$MAIN_SHA"');
    expect(workflow).toContain('git merge --abort');
    expect(workflow).toContain('-X ours');
    expect(workflow).toContain('explicit staging-wins conflict policy');
    expect(workflow).toContain('current_parents');
    expect(workflow).toContain('"${STAGING_SHA} ${MAIN_SHA}"');
    expect(workflow).toContain('--force-with-lease="refs/heads/${SYNC_BRANCH}:${current_sync_sha}"');
    expect(workflow).toContain('--base staging');
    expect(workflow).toContain('--head "$SYNC_BRANCH"');
    expect(workflow).toContain("--title 'sync: main back into staging'");
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('--ref "$SYNC_BRANCH"');
    expect(workflow).toContain('no duplicate CI run needed');
    expect(workflow).not.toContain('gh pr merge');
  });
});
