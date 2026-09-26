const fs = require('node:fs');
const path = require('node:path');

describe('staging promotion workflow', () => {
  it('freezes one verified release candidate and bumps patch SemVer exactly once', () => {
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

    expect(workflow).toContain('Prepare frozen production release candidate');
    expect(workflow).toContain('Open production release PR');
    expect(workflow).toContain('Trigger required checks for frozen release');
    expect(workflow).toContain('gh pr list');
    expect(workflow).toContain('Open production release PR #$existing is frozen; leaving $PROMOTION_BRANCH unchanged.');
    expect(workflow).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging');
    expect(workflow).toContain('git diff --name-only origin/main..."$VERIFIED_SHA"');
    expect(workflow).toContain('BASE_VERSION="$(git show origin/main:VERSION');
    expect(workflow).toContain('RELEASE_VERSION="$major.$minor.$((patch + 1))"');
    expect(workflow).toContain('git checkout --detach "$VERIFIED_SHA"');
    expect(workflow).toContain('printf \'%s\\n\' "$RELEASE_VERSION" > VERSION');
    expect(workflow).toContain('git commit -m "release: v$RELEASE_VERSION"');
    expect(workflow).toContain('git ls-remote --heads origin "refs/heads/$PROMOTION_BRANCH"');
    expect(workflow).toContain('--force-with-lease="refs/heads/$PROMOTION_BRANCH:$current_promotion_sha"');
    expect(workflow).toContain('--title "release: v${RELEASE_VERSION}"');
    expect(workflow).toContain('This release candidate is immutable while the PR is open.');
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('--ref "$PROMOTION_BRANCH"');
    expect(workflow).toContain('-f pr_number="$promotion_pr"');

    expect(workflow).not.toContain('Open or update production promotion PR');
    expect(workflow).not.toContain('Updated production promotion PR');
    expect(workflow).not.toContain("--title 'promote: verified staging to production'");
    expect(workflow).not.toContain('statuses: write');
  });
});
