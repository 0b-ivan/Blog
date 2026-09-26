const fs = require('node:fs');
const path = require('node:path');

describe('staging publication handoff', () => {
  it('verifies staging and hands article work to the publication pipeline without creating a release', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'cd-staging.yml'),
      'utf8'
    );

    expect(workflow).toContain('Detect changed posts needing Pixabay cover resolution');
    expect(workflow).toContain('COVER_BACKFILL_LIMIT: "20"');
    expect(workflow).toContain('Resolve missing Pixabay covers');
    expect(workflow).toContain('id: source_pr');
    expect(workflow).toContain('pr_number=$pr_number');
    expect(workflow).toContain('Dispatch verified Article Publication candidate');
    expect(workflow).toContain('gh workflow run publish-article.yml');
    expect(workflow).toContain('-f source_sha="$SOURCE_SHA"');
    expect(workflow).toContain('-f staging_pr_number="$STAGING_PR"');

    expect(workflow).not.toContain('PROMOTION_BRANCH');
    expect(workflow).not.toContain('promotion/staging-verified');
    expect(workflow).not.toContain('Prepare frozen production release candidate');
    expect(workflow).not.toContain('Open production release PR');
    expect(workflow).not.toContain('release: v$RELEASE_VERSION');
  });
});
