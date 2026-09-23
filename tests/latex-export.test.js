const path = require('node:path');
const {
  buildPdfDocumentPreview,
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
      coverImage: '/tmp/blog/assets/covers/demo.jpg'
    });
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
