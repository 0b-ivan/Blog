const fs = require('node:fs');
const path = require('node:path');

describe('promotion watchdog workflow', () => {
  it('self-heals required checks on the current synthetic merge commit', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'promotion-watchdog.yml'),
      'utf8'
    );

    expect(workflow).toContain("cron: '27 * * * *'");
    expect(workflow).toContain('workflows:');
    expect(workflow).toContain('- PR Checks');
    expect(workflow).toContain('checks: write');
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('--head "$PROMOTION_BRANCH"');
    expect(workflow).toContain('merge_commit_sha // empty');
    expect(workflow).toContain("latest_required_check \"$head_sha\" 'checks'");
    expect(workflow).toContain("latest_required_check \"$head_sha\" 'Local assets'");
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('/check-runs');
    expect(workflow).toContain('GitHub regenerated the synthetic merge commit');
    expect(workflow).toContain('for repair_round in $(seq 1 8)');
    expect(workflow).toContain('the scheduled watchdog will retry automatically');
    expect(workflow).not.toContain('actions/checkout');
  });
});
