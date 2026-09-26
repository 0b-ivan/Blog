const fs = require('node:fs');
const path = require('node:path');

describe('CI PDF smoke test selection', () => {
  it('only renders published posts that exist on the checked-out branch', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'),
      'utf8'
    );

    expect(workflow).toContain('add_slug_if_published()');
    expect(workflow).toContain('[ -f "$post" ] || return 0');
    expect(workflow).toContain("grep -Eq '^status:[[:space:]]*publish[[:space:]]*$' \"$post\"");
    expect(workflow).toContain("find posts -maxdepth 1 -type f -name '*.md' -print | sort");
    expect(workflow).toContain('Need at least two published posts for the LaTeX PDF smoke test');
    expect(workflow).toContain('for slug in "${smoke_slugs[@]:0:2}"');

    expect((workflow.match(/- name: LaTeX PDF smoke test/g) || []).length).toBe(1);
    expect((workflow.match(/- name: Browser click smoke test/g) || []).length).toBe(1);
    expect((workflow.match(/^ {2}local-assets:/gm) || []).length).toBe(1);
    expect((workflow.match(/^ {2}mirror-required-pr-checks:/gm) || []).length).toBe(1);
    expect(workflow).not.toContain("grep -Eq '^status:[[:space:]]*publish[[:space:]]*\n");
  });
});
