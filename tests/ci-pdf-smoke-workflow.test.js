const fs = require('node:fs');
const path = require('node:path');

describe('CI PDF smoke test selection', () => {
  it('keeps the required check topology while delegating PDF behavior to a script', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'),
      'utf8'
    );
    const pdfSmoke = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'workflows', 'ci', 'pdf-smoke.sh'),
      'utf8'
    );

    expect(workflow).toContain('bash scripts/workflows/ci/pdf-smoke.sh');
    expect(pdfSmoke).toContain('add_slug_if_published()');
    expect(pdfSmoke).toContain('[ -f "$post" ] || return 0');
    expect(pdfSmoke).toContain("grep -Eq '^status:[[:space:]]*publish[[:space:]]*$' \"$post\"");
    expect(pdfSmoke).toContain("find posts -maxdepth 1 -type f -name '*.md' -print | sort");
    expect(pdfSmoke).toContain('Need at least two published posts for the LaTeX PDF smoke test');
    expect(pdfSmoke).toContain('for slug in "${smoke_slugs[@]:0:2}"');

    expect((workflow.match(/- name: LaTeX PDF smoke test/g) || []).length).toBe(1);
    expect((workflow.match(/- name: Browser click smoke test/g) || []).length).toBe(1);
    expect((workflow.match(/^ {2}local-assets:/gm) || []).length).toBe(1);
    expect((workflow.match(/^ {2}mirror-required-pr-checks:/gm) || []).length).toBe(1);
    expect(workflow).not.toContain("grep -Eq '^status:[[:space:]]*publish[[:space:]]*\n");
  });
});
