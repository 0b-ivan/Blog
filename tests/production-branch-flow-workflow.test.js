const fs = require('node:fs');
const path = require('node:path');

describe('trusted production branch-flow workflow', () => {
  it('uses pull_request_target and checks out the base revision without running PR code', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'production-branch-flow.yml'),
      'utf8'
    );

    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('git fetch origin "$HEAD_SHA"');
    expect(workflow).toContain('node scripts/check-production-pr.js');
    expect(workflow).not.toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).not.toContain('npm install');
    expect(workflow).not.toContain('npm test');
  });
});
