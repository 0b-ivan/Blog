const fs = require('node:fs');
const path = require('node:path');

const repoFile = (...parts) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('staging promotion workflow', () => {
  it('keeps orchestration in YAML and deployment behavior in focused scripts', () => {
    const workflow = repoFile('.github', 'workflows', 'cd-staging.yml');
    const coverDetection = repoFile('scripts', 'workflows', 'staging', 'detect-cover-candidates.sh');
    const coverResolution = repoFile('scripts', 'workflows', 'staging', 'resolve-covers.sh');
    const deploymentClassification = repoFile('scripts', 'workflows', 'staging', 'classify-deployment.sh');
    const publishCandidate = repoFile('scripts', 'workflows', 'staging', 'publish-promotion-candidate.sh');
    const promotionPr = repoFile('scripts', 'workflows', 'staging', 'manage-promotion-pr.sh');
    const promotionCi = repoFile('scripts', 'workflows', 'staging', 'trigger-promotion-ci.sh');
    const handoff = repoFile('scripts', 'workflows', 'staging', 'handoff.sh');

    expect(workflow).toContain('Detect changed posts needing Pixabay cover resolution');
    expect(workflow).toContain('COVER_BACKFILL_LIMIT: "20"');
    expect(workflow).toContain('bash scripts/workflows/staging/detect-cover-candidates.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/resolve-covers.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/classify-deployment.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/publish-promotion-candidate.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/manage-promotion-pr.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/trigger-promotion-ci.sh');
    expect(workflow).toContain('bash scripts/workflows/staging/handoff.sh');

    expect(coverDetection).toContain('scripts/list-missing-cover-posts.js --limit "$COVER_BACKFILL_LIMIT"');
    expect(coverDetection).toContain('cover_query|cover_subject|cover_avoid|cover_intent');
    expect(coverDetection).toContain('Cover brief changed for $post; refreshing Pixabay cover');
    expect(coverResolution).toContain('--report "/tmp/cover-reports/${slug}.json"');
    expect(coverResolution).toContain('--reports-dir /tmp/cover-reports');
    expect(deploymentClassification).toContain('.github/workflows/*|.github/workflows/**/*|docs/*|docs/**/*|tests/*|tests/**/*');

    expect(workflow).toContain('PIXABAY_API_KEY');
    expect(workflow).toContain('steps.source.outputs.sha');
    expect(workflow).toContain('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9');
    expect(publishCandidate).toContain('git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging');
    expect(publishCandidate).toContain('git ls-remote --heads origin "refs/heads/${PROMOTION_BRANCH}"');
    expect(publishCandidate).toContain('--force-with-lease="refs/heads/${PROMOTION_BRANCH}:${current_promotion_sha}"');
    expect(publishCandidate).not.toContain('git rev-parse "refs/remotes/origin/${PROMOTION_BRANCH}"');
    expect(publishCandidate).not.toContain('git push origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"');

    expect(workflow).toContain('actions: write');
    expect(workflow).not.toContain("    paths:\n      - 'posts/**'");
    expect(workflow).toContain("- name: Publish verified promotion candidate\n        if: github.event_name == 'push'");
    expect(workflow).toContain("- name: Open or update production promotion PR\n        if: github.event_name == 'push'");
    expect(promotionPr).toContain('Staging control-plane/GitOps state');
    expect(handoff).toContain('the promotion pointer was advanced to the current staging history');
    expect(workflow).toContain('Trigger required checks for production promotion');
    expect(promotionCi).toContain('gh workflow run ci.yml');
    expect(promotionCi).toContain('--ref "$PROMOTION_BRANCH"');
    expect(promotionCi).toContain('-f pr_number="$promotion_pr"');
    expect(workflow).not.toContain('statuses: write');
  });
});
