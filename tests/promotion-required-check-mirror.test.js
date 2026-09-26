const fs = require('node:fs');
const path = require('node:path');

describe('promotion required check mirroring', () => {
  it('mirrors workflow-dispatch results to the PR synthetic merge commit', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'),
      'utf8'
    );

    expect(workflow).toContain('pr_number:');
    expect(workflow).toContain('Mirror required PR checks');
    expect(workflow).toContain('Mirror required checks to PR merge commit');
    expect(workflow).toContain("merge_commit_sha // empty");
    expect(workflow).toContain('pr_head_sha');
    expect(workflow).toContain('DISPATCH_SHA');
    expect(workflow).toContain('/check-runs');
    expect(workflow).toContain('publish_check checks "$CHECKS_RESULT"');
    expect(workflow).toContain("publish_check 'Local assets' "$LOCAL_ASSETS_RESULT"");
    expect(workflow).toContain('checks: write');
  });
});
