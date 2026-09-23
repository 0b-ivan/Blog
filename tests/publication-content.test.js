const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildAuthorHtml,
  buildPublicationContent,
  expandSnippetLinks,
  rewriteGlossaryLinks,
  splitArticleSections,
  usedGlossaryEntries
} = require('../lib/publication-content');

describe('offline publication content', () => {
  let assetRoot;

  beforeEach(async () => {
    assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-publication-'));
  });

  afterEach(async () => {
    await fs.rm(assetRoot, { recursive: true, force: true });
  });

  it('embeds referenced snippet source instead of leaving a runtime fetch dependency', async () => {
    const snippets = path.join(assetRoot, 'snippets', 'demo');
    await fs.mkdir(snippets, { recursive: true });
    await fs.writeFile(
      path.join(snippets, 'example.sh'),
      ['echo one', 'echo two', 'echo three', 'echo four'].join('\n'),
      'utf8'
    );

    const metadata = JSON.stringify({
      path: 'demo/example.sh',
      title: 'Beispiel',
      language: 'bash',
      type: 'Shellskript',
      description: 'Ein Offline-Snippet'
    }).replace(/"/g, '&quot;');

    const html = `<p><a href="/snippets/demo/example.sh" title="snippet:bash:2-3" data-snippet="${metadata}">Beispiel</a></p>`;
    const expanded = await expandSnippetLinks(html, assetRoot);

    expect(expanded).toContain('class="ebook-snippet"');
    expect(expanded).toContain('echo two');
    expect(expanded).toContain('echo three');
    expect(expanded).not.toContain('echo one');
    expect(expanded).not.toContain('fetch(');
    expect(expanded).not.toContain('/snippets/demo/example.sh');
  });

  it('collects only used glossary terms and rewrites them to local EPUB anchors', () => {
    const html = '<p>Eine <abbr data-glossary-key="VPC">VPC</abbr> nutzt ein Netz.</p>';
    const entries = usedGlossaryEntries(html);
    const rewritten = rewriteGlossaryLinks(html);

    expect(entries.map((entry) => entry.key)).toEqual(['VPC']);
    expect(rewritten).toContain('href="glossary.xhtml#glossary-vpc"');
    expect(rewritten).not.toContain('<abbr');
  });

  it('creates a useful TOC structure from article h2 sections', () => {
    const sections = splitArticleSections(
      '<p>Intro.</p><h2>Hypothese</h2><p>A</p><h2>Blast Radius</h2><p>B</p>',
      'Einleitung'
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Einleitung',
      'Hypothese',
      'Blast Radius'
    ]);
  });

  it('builds one normalized publication with offline snippets, glossary and author data', async () => {
    const snippets = path.join(assetRoot, 'snippets', 'demo');
    const config = path.join(assetRoot, 'config');
    await fs.mkdir(snippets, { recursive: true });
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(path.join(snippets, 'demo.sh'), 'kubectl get pods\n', 'utf8');
    await fs.writeFile(
      path.join(config, 'author.json'),
      JSON.stringify({
        name: 'Ivan Babayev',
        role: 'Cloud Infrastructure Engineer',
        bio: ['Technische Praxisnotizen.'],
        focus: ['AWS'],
        photo: '/assets/profile-obivan.PNG'
      }),
      'utf8'
    );

    const metadata = JSON.stringify({
      path: 'demo/demo.sh',
      title: 'kubectl',
      language: 'bash'
    }).replace(/"/g, '&quot;');

    const publication = await buildPublicationContent({
      title: 'Test',
      html: `<p><abbr data-glossary-key="VPC">VPC</abbr></p>
<p><a href="/snippets/demo/demo.sh" title="snippet:bash" data-snippet="${metadata}">kubectl</a></p>
<h2>Praxis</h2><p>Text</p>`
    }, { assetRoot });

    expect(publication.sections.map((entry) => entry.title)).toEqual(['Einleitung', 'Praxis']);
    expect(publication.articleHtml).toContain('kubectl get pods');
    expect(publication.articleHtml).toContain('glossary.xhtml#glossary-vpc');
    expect(publication.glossaryHtml).toContain('Virtual Private Cloud');
    expect(publication.authorProfile.name).toBe('Ivan Babayev');
    expect(buildAuthorHtml(publication.authorProfile)).toContain('Über den Autor');
  });
});
