const fs = require('node:fs');
const path = require('node:path');

describe('staging promotion workflow', () => {
  it('updates the verified promotion branch as a race-safe pointer', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'cd-staging.yml'),
      'utf8'
    );

    expect(workflow).toContain('Detect changed posts needing Pixabay cover resolution');
    expect(workflow).toContain('COVER_BACKFILL_LIMIT: "20"');
    expect(workflow).toContain('scripts/list-missing-cover-posts.js --limit "$COVER_BACKFILL_LIMIT"');
    expect(workflow).toContain('Resolve missing Pixabay covers');
    expect(workflow).toContain('cover_query|cover_subject|cover_avoid|cover_intent');
    expect(workflow).toContain('Cover brief changed for $post; refreshing Pixabay cover');
    expect(workflow).toContain('--report "/tmp/cover-reports/${slug}.json"');
    expect(workflow).toContain('scripts/render-cover-review.js');
    expect(workflow).toContain('--reports-dir /tmp/cover-reports');
    expect(workflow).toContain('PIXABAY_API_KEY');
    expect(workflow).toContain('steps.source.outputs.sha');
    expect(workflow).toContain('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9');
    expect(workflow).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging');
    expect(workflow).toContain('git ls-remote --heads origin "refs/heads/${PROMOTION_BRANCH}"');
    expect(workflow).toContain('--force-with-lease="refs/heads/${PROMOTION_BRANCH}:${current_promotion_sha}"');
    expect(workflow).not.toContain('git rev-parse "refs/remotes/origin/${PROMOTION_BRANCH}"');
    expect(workflow).not.toContain('git push origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"');
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('Trigger required checks for production promotion');
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('--ref "$PROMOTION_BRANCH"');
  });
});
