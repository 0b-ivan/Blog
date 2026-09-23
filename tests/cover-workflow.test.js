const fs = require('node:fs');
const path = require('node:path');

describe('cover review workflows', () => {
  it('shows ranked previews in manual article cover pull requests', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'article-cover.yml'),
      'utf8'
    );

    expect(workflow).toContain('--report "$report"');
    expect(workflow).toContain('scripts/render-cover-review.js');
    expect(workflow).toContain('--report /tmp/cover-report.json');
    expect(workflow).toContain('--commit "$cover_commit"');
    expect(workflow).toContain('Candidate previews are shown only for editorial review');
  });

  it('shows selected covers and ranked candidates in backfill pull requests', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'backfill-article-covers.yml'),
      'utf8'
    );

    expect(workflow).toContain('/tmp/cover-reports/${slug}.json');
    expect(workflow).toContain('scripts/render-cover-review.js');
    expect(workflow).toContain('--reports-dir /tmp/cover-reports');
    expect(workflow).toContain('--commit "$cover_commit"');
    expect(workflow).toContain('scope:');
    expect(workflow).toContain('--include-covered');
    expect(workflow).toContain("pr_title='feat: review existing article covers'");
    expect(workflow).toContain("'.github/cover-backfill-request.txt'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.scope || 'all'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.batch_size || '20'");
  });
});
