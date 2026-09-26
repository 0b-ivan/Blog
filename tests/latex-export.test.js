const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareSvgImagesForPdf } = require('../pdf-export-server');
const {
  buildBibTeX,
  buildPdfDocumentPreview,
  containsCjkText,
  normalizeFiguresForPdf,
  pdfMetadata,
  promoteArticleHeadings,
  rewriteGlossaryLinksForPdf,
  rewriteSourceLinksForPdf
} = require('../lib/latex-export');

describe('LaTeX publication export', () => {
  it('maps article metadata into scientific publication fields', () => {
    const metadata = pdfMetadata({
      slug: 'demo',
      title: 'Chaos Engineering systematisch testen',
      author: 'obivan',
      date: '2026-09-20',
      category: 'DevOps',
      excerpt: 'Kontrolliertes Testen von Resilience.',
      tags: ['Chaos-Engineering', 'SRE'],
      readingTime: 4,
      coverImage: '/assets/covers/demo.jpg'
    }, {
      assetRoot: path.resolve('/tmp/blog'),
      siteUrl: 'https://blog.obivan.org'
    });

    expect(metadata).toMatchObject({
      title: 'Chaos Engineering systematisch testen',
      author: 'Ivan Babayev',
      category: 'DevOps',
      abstract: 'Kontrolliertes Testen von Resilience.',
      keywords: 'Chaos-Engineering, SRE',
      readingTime: '4',
      sourceUrl: 'https://blog.obivan.org/posts/demo',
      coverImage: '/tmp/blog/assets/covers/demo.jpg',
      cjk: ''
    });
  });

  it('enables the CJK LaTeX stack only when Japanese text is present', () => {
    expect(containsCjkText('Chaos Engineering ohne japanischen Text')).toBe(false);
    expect(containsCjkText('Warum パクパク zu Pac-Man gehört')).toBe(true);

    const plain = pdfMetadata({
      slug: 'plain',
      title: 'Chaos Engineering',
      excerpt: 'Resilience testen.',
      html: '<p>Nur deutscher Text.</p>'
    });
    expect(plain.cjk).toBe('');

    const japanese = pdfMetadata({
      slug: 'pac-man',
      title: 'Warum Pac-Man zuerst Puck Man hieß',
      excerpt: 'Namensgeschichte.',
      html: '<p>Der Ausdruck パクパク beschreibt die Mundbewegung.</p>'
    });
    expect(japanese.cjk).toBe('true');
  });

  it('uses local glossary anchors in the LaTeX/Pandoc source document', () => {
    expect(
      rewriteGlossaryLinksForPdf('<a href="glossary.xhtml#glossary-vpc">VPC</a>')
    ).toBe('<a href="#glossary-vpc">VPC</a>');
  });

  it('normalizes article headings and source anchors for the paper renderer', () => {
    expect(
      promoteArticleHeadings('<h2>Hypothese</h2><h3>Messung</h3>')
    ).toBe('<h1>Hypothese</h1><h2>Messung</h2>');

    expect(
      rewriteSourceLinksForPdf('<a href="sources.xhtml#source-docker-compose">[1]</a>')
    ).toBe('<a href="#source-docker-compose">[1]</a>');
  });

  it('turns standalone article images into bounded scientific figures', () => {
    const html = normalizeFiguresForPdf(
      '<p><img src="/assets/posts/pac-man/timeline.svg" alt="Zeitleiste von Puck Man zu Pac-Man" /></p><p><em>Chronologie der Umbenennung im Jahr 1980.</em></p>'
    );

    expect(html).toContain('<figure class="paper-figure">');
    expect(html).toContain('width="88%" height="52%"');
    expect(html).toContain('<figcaption>Chronologie der Umbenennung im Jahr 1980.</figcaption>');
    expect(html).not.toContain('<p><em>');
  });


  it('preserves an explicit Markdown image width in the PDF figure', () => {
    const html = normalizeFiguresForPdf(
      '<p><img src="/assets/posts/pac-man/timeline.svg" alt="Timeline" data-image-width="42" style="width:42%;max-width:100%;height:auto;" /></p>'
    );

    expect(html).toContain('width="42%"');
    expect(html).not.toContain('height="52%"');
    expect(html).not.toContain('data-image-width=');
    expect(html).not.toContain('style="width:42%');
  });

  it('generates bibliography records for the sources used by the paper', () => {
    const bib = buildBibTeX([{
      id: 'kubernetes-probes',
      title: 'Liveness, Readiness, and Startup Probes',
      publisher: 'Kubernetes Documentation',
      url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/',
      accessed_at: '2026-09-20'
    }, {
      id: 'cover-demo',
      title: 'Coverbild: Demo',
      publisher: 'Pixabay',
      author: 'Example',
      url: 'https://pixabay.com/photos/example-42/',
      license: 'Pixabay Content License'
    }]);

    expect(bib).toContain('@misc{kubernetes-probes');
    expect(bib).toContain('organization = {Kubernetes Documentation}');
    expect(bib).toContain('urldate = {2026-09-20}');
    expect(bib).toContain('@misc{cover-demo');
    expect(bib).toContain('author = {Example}');
    expect(bib).toContain('note = {Pixabay Content License}');
  });

  it('converts local SVG article images to PNG before Pandoc/LuaLaTeX', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-svg-pdf-'));
    const assetRoot = path.join(tempDir, 'repo');
    const svg = path.join(assetRoot, 'assets', 'posts', 'pac-man', 'timeline.svg');
    const calls = [];

    try {
      const html = `<p><img src="${svg}" alt="Timeline" /></p>`;
      const converted = await prepareSvgImagesForPdf(html, tempDir, {
        assetRoot,
        execImpl: async (command, args) => {
          calls.push({ command, args });
        }
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('rsvg-convert');
      expect(calls[0].args).toContain(svg);
      expect(converted).not.toContain(svg);
      expect(converted).toContain('article-image-1.png');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps preview metadata independent from the EPUB renderer', () => {
    const preview = buildPdfDocumentPreview({
      slug: 'paper',
      title: 'Paper',
      author: 'obivan',
      date: '2026-09-23',
      excerpt: 'Abstract'
    });

    expect(preview.title).toBe('Paper');
    expect(preview.author).toBe('Ivan Babayev');
    expect(preview.abstract).toBe('Abstract');
  });
});
