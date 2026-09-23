const {
  COMMENT_MARKER,
  canonicalizeCandidateTerm,
  renderMarkdownReport,
  suggestGlossaryTerms
} = require('../lib/glossary-suggestions');
const {
  parseOptions,
  renderReport
} = require('../scripts/suggest-glossary-terms');

describe('glossary suggestions', () => {
  const entries = [
    {
      key: 'VPC',
      aliases: ['AWS VPC']
    },
    {
      key: 'GraphRAG',
      aliases: []
    },
    {
      key: 'API',
      aliases: []
    },
    {
      key: 'IP',
      aliases: []
    }
  ];

  it('suggests high-confidence technical tokens and contextual product names', () => {
    const markdown = [
      '---',
      'title: Test',
      '---',
      '',
      'Die VPC bleibt ein bekannter Begriff.',
      'Für das Ranking testen wir RRF zusammen mit OpenTelemetry.',
      'Wir deployen mit Kubernetes.',
      'GraphRAG ist ebenfalls schon gepflegt.'
    ].join('\n');

    const suggestions = suggestGlossaryTerms(markdown, {
      entries,
      file: 'posts/test.md'
    });
    const byTerm = new Map(suggestions.map((entry) => [entry.term, entry]));

    expect(byTerm.has('VPC')).toBe(false);
    expect(byTerm.has('GraphRAG')).toBe(false);
    expect(byTerm.get('RRF')?.confidence).toBe('high');
    expect(byTerm.get('OpenTelemetry')?.confidence).toBe('high');
    expect(byTerm.get('Kubernetes')?.confidence).toBe('medium');
    expect(byTerm.get('Kubernetes')?.occurrences[0]).toMatchObject({
      file: 'posts/test.md',
      line: 7
    });
  });

  it('ignores frontmatter, managed glossary definitions, inline code and fenced code', () => {
    const markdown = [
      '---',
      'title: SECRETAPI',
      '---',
      '',
      'Inline `InlineSDK` bleibt unberücksichtigt.',
      '',
      '```text',
      'HIDDENAPI OpenCodeThing',
      '```',
      '',
      'Sichtbar bleibt NEWAPI.',
      '',
      '<!-- glossary:start -->',
      '*[MANAGEDAPI]: Managed API',
      '<!-- glossary:end -->'
    ].join('\n');

    const terms = new Set(suggestGlossaryTerms(markdown, { entries, file: 'posts/test.md' })
      .map((entry) => entry.term));

    expect(terms.has('SECRETAPI')).toBe(false);
    expect(terms.has('InlineSDK')).toBe(false);
    expect(terms.has('HIDDENAPI')).toBe(false);
    expect(terms.has('OpenCodeThing')).toBe(false);
    expect(terms.has('MANAGEDAPI')).toBe(false);
    expect(terms.has('NEWAPI')).toBe(true);
  });

  it('ignores repository paths without hiding technical slash terms', () => {
    const suggestions = suggestGlossaryTerms([
      'snippets/2026-09-16-k3s/01-example.sh',
      'assets/posts/k3s/diagram.svg',
      'SOPS/age bleibt dagegen ein echter technischer Begriff.'
    ].join('\n'), {
      entries,
      file: 'posts/test.md'
    });

    const terms = new Set(suggestions.map((entry) => entry.term));
    expect([...terms].some((term) => term.startsWith('snippets/'))).toBe(false);
    expect([...terms].some((term) => term.startsWith('assets/'))).toBe(false);
    expect(terms.has('SOPS/age')).toBe(true);
  });

  it('filters ordinary hyphen compounds and markdown link destinations', () => {
    const suggestions = suggestGlossaryTerms([
      'Admin-Rechner, Staging-Prüfung und Minor-Version sind normale zusammengesetzte Wörter.',
      '[K3s-Version mit Ansible fest pinnen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/01-k3s-version-pin.yml "snippet:yaml")',
      '[Cloudflare Deployment](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/05-cloudflared-deployment.yml "snippet:yaml")',
      'OpenTelemetry und NodePortLike bleiben als CamelCase-Kandidaten sichtbar.'
    ].join('\n'), {
      entries,
      file: 'posts/test.md'
    });

    const terms = new Set(suggestions.map((entry) => entry.term));
    expect(terms.has('Admin-Rechner')).toBe(false);
    expect(terms.has('Staging-Prüfung')).toBe(false);
    expect(terms.has('Minor-Version')).toBe(false);
    expect([...terms].some((term) => term.includes('cloudflare-part-1/'))).toBe(false);
    expect([...terms].some((term) => term.includes('k3s-proxmox-hardening-part-3/'))).toBe(false);
    expect(terms.has('OpenTelemetry')).toBe(true);
    expect(terms.has('NodePortLike')).toBe(true);
  });

  it('normalizes inflected and compound technical terms before matching', () => {
    expect(canonicalizeCandidateTerm('APIs')).toBe('API');
    expect(canonicalizeCandidateTerm('IPs')).toBe('IP');
    expect(canonicalizeCandidateTerm('AMI-ID')).toBe('AMI');
    expect(canonicalizeCandidateTerm('Shell-Befehlen')).toBe('Shell');
    expect(canonicalizeCandidateTerm('Cloudflare. Mit')).toBe('Cloudflare');

    const suggestions = suggestGlossaryTerms(
      'APIs und IPs sind bereits bekannte Begriffe. PVC bleibt ein neuer Fachbegriff.',
      { entries, file: 'posts/test.md' }
    );
    const terms = new Set(suggestions.map((entry) => entry.term));

    expect(terms.has('APIs')).toBe(false);
    expect(terms.has('API')).toBe(false);
    expect(terms.has('IPs')).toBe(false);
    expect(terms.has('IP')).toBe(false);
    expect(terms.has('PVC')).toBe(true);
  });

  it('drops ordinary contextual words even when they repeat', () => {
    const markdown = [
      'Wir deployen mit werden.',
      'Wir deployen mit wird.',
      'Wir deployen mit einen.',
      'Wir deployen mit fest.',
      'Wir deployen mit bekannten Schwachstellen.',
      'Wir deployen mit Kubernetes.'
    ].join('\n');

    const terms = new Set(suggestGlossaryTerms(markdown, {
      entries,
      file: 'posts/test.md'
    }).map((entry) => entry.term));

    expect(terms.has('werden')).toBe(false);
    expect(terms.has('wird')).toBe(false);
    expect(terms.has('einen')).toBe(false);
    expect(terms.has('fest')).toBe(false);
    expect(terms.has('bekannten Schwachstellen')).toBe(false);
    expect(terms.has('Kubernetes')).toBe(true);
  });

  it('uses repeated technical usage as a confidence signal', () => {
    const suggestions = suggestGlossaryTerms([
      'Wir deployen mit Kubernetes.',
      'Wir testen mit Kubernetes.',
      'Wir betreiben mit Kubernetes.'
    ].join('\n'), {
      entries,
      file: 'posts/test.md'
    });

    const kubernetes = suggestions.find((entry) => entry.term === 'Kubernetes');
    expect(kubernetes?.occurrences).toHaveLength(3);
    expect(kubernetes?.confidence).toBe('high');
    expect(kubernetes?.reasons).toContain('Mehrfacher technischer Gebrauch erhöht die Wiederverwendbarkeit');
  });

  it('does not classify ordinary numeric hyphen compounds as technical terms', () => {
    const terms = new Set(suggestGlossaryTerms(
      '30-Sekunden- und Debian-13-Cloud- sind keine Glossarbegriffe.',
      { entries, file: 'posts/test.md' }
    ).map((entry) => entry.term));

    expect(terms.has('30-Sekunden')).toBe(false);
    expect(terms.has('Debian-13-Cloud')).toBe(false);
  });

  it('honors the persistent ignore list', () => {
    const suggestions = suggestGlossaryTerms('RRF und OpenTelemetry werden getestet.', {
      entries,
      ignoredTerms: ['RRF'],
      file: 'posts/test.md'
    });

    expect(suggestions.some((entry) => entry.term === 'RRF')).toBe(false);
    expect(suggestions.some((entry) => entry.term === 'OpenTelemetry')).toBe(true);
  });

  it('renders one stable, non-blocking PR report', () => {
    const suggestions = suggestGlossaryTerms('Wir testen RRF.', {
      entries,
      file: 'posts/test.md'
    });
    const report = renderMarkdownReport(suggestions, { scannedFiles: 1 });

    expect(report).toContain(COMMENT_MARKER);
    expect(report).toContain('## Glossar-Vorschläge');
    expect(report).toContain('**nicht blockierend**');
    expect(report).toContain('`RRF`');
    expect(report).toContain('config/glossary-suggestion-ignore.json');
  });

  it('renders a clean success report when no candidate remains', () => {
    const report = renderReport([], 'markdown', 2);

    expect(report).toContain(COMMENT_MARKER);
    expect(report).toContain('Geprüfte Artikel: **2**');
    expect(report).toContain('Keine neuen Fachbegriffe');
  });

  it('parses CLI output options without changing the non-blocking behavior', () => {
    expect(parseOptions([
      '--format', 'markdown',
      '--output', '/tmp/report.md',
      'posts/a.md',
      'posts/b.md'
    ])).toEqual({
      files: ['posts/a.md', 'posts/b.md'],
      format: 'markdown',
      output: '/tmp/report.md'
    });
  });
});
