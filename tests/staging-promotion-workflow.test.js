const fs = require('node:fs');
const path = require('node:path');

describe('staging promotion workflow', () => {
  it('updates the verified promotion branch as a race-safe pointer', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'cd-staging.yml'),
      'utf8'
    );

    expect(workflow).toContain('Detect changed published posts without covers');
    expect(workflow).toContain('Resolve missing Pixabay covers');
    expect(workflow).toContain('PIXABAY_API_KEY');
    expect(workflow).toContain('steps.source.outputs.sha');
    expect(workflow).toContain('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9');
    expect(workflow).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging');
    expect(workflow).toContain('git ls-remote --heads origin "refs/heads/${PROMOTION_BRANCH}"');
    expect(workflow).toContain('--force-with-lease="refs/heads/${PROMOTION_BRANCH}:${current_promotion_sha}"');
    expect(workflow).not.toContain('git rev-parse "refs/remotes/origin/${PROMOTION_BRANCH}"');
    expect(workflow).not.toContain('git push origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"');
  });
});
