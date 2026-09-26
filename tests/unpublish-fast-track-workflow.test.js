const fs = require('node:fs');
const path = require('node:path');

describe('unpublish fast-track workflow', () => {
  it('only auto-merges deletion-only unpublish PRs after required checks', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'auto-merge-unpublish.yml'),
      'utf8'
    );

    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('OBSIDIAN_PUBLISHER_GITHUB_TOKEN');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('staging:obsidian/*');
    expect(workflow).toContain('main:obsidian-unpublish/main/*');
    expect(workflow).toContain('startswith("Unpublish: ")');
    expect(workflow).toContain('.status != "removed"');
    expect(workflow).toContain('^(posts|archive)/[^/]+\\.md$');
    expect(workflow).toContain('latest_check_conclusion "$head_sha" checks');
    expect(workflow).toContain("latest_check_conclusion \"$head_sha\" 'Local assets'");
    expect(workflow).toContain('gh pr close "$stale_promotion"');
    expect(workflow).toContain('gh pr merge "$pr_number"');
    expect(workflow).toContain('--merge');
    expect(workflow).not.toContain('--admin');
  });
});
