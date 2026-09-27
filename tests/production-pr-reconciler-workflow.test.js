const fs = require('node:fs');
const path = require('node:path');

describe('production PR reconciler', () => {
  it('repairs required checks for parallel Publication and Release PRs', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'production-pr-reconciler.yml'),
      'utf8'
    );

    expect(workflow).toContain('Production PR Reconciler');
    expect(workflow).toContain('publication/');
    expect(workflow).toContain('release/');
    expect(workflow).toContain('merge_commit_sha // empty');
    expect(workflow).toContain('latest_required_check "$head_sha" checks');
    expect(workflow).toContain('latest_required_check "$head_sha" \'Local assets\'');
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('-f pr_number="$pr_number"');
    expect(workflow).toContain('Mirrored ${context}=${conclusion}');
    expect(workflow).not.toContain('promotion/staging-verified');
  });
});
