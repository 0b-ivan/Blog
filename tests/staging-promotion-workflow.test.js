const fs = require('node:fs');
const path = require('node:path');

describe('staging promotion workflow', () => {
  it('updates the verified promotion branch as a race-safe pointer', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'cd-staging.yml'),
      'utf8'
    );

    expect(workflow).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging');
    expect(workflow).toContain('--force-with-lease="refs/heads/${PROMOTION_BRANCH}:${current_promotion_sha}"');
    expect(workflow).not.toContain('git push origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"\n          echo');
  });
});
