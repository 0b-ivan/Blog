const {
  pdfRenderState,
  prepareArticlePdf
} = require('../pdf-export-server');

describe('PDF render cache', () => {
  it('deduplicates concurrent renders and reuses the finished PDF', async () => {
    const post = {
      slug: 'cached-render-test',
      version: 7,
      updatedAt: '2026-09-25'
    };

    let resolveCompile;
    const compileImpl = globalThis.vi.fn(() => new Promise((resolve) => {
      resolveCompile = resolve;
    }));

    const first = prepareArticlePdf(post, { compileImpl });
    const second = prepareArticlePdf(post, { compileImpl });

    expect(compileImpl).toHaveBeenCalledOnce();
    expect(pdfRenderState(post)).toMatchObject({
      ready: false,
      preparing: true
    });

    const pdf = Buffer.from('%PDF-cache-test');
    resolveCompile(pdf);

    await expect(first).resolves.toEqual(pdf);
    await expect(second).resolves.toEqual(pdf);
    expect(pdfRenderState(post)).toMatchObject({
      ready: true,
      preparing: false
    });

    await expect(prepareArticlePdf(post, { compileImpl })).resolves.toEqual(pdf);
    expect(compileImpl).toHaveBeenCalledOnce();
  });

  it('clears the pending state after a failed render so it can be retried', async () => {
    const post = {
      slug: 'failed-render-test',
      version: 1,
      updatedAt: '2026-09-25'
    };

    const firstCompile = globalThis.vi.fn(async () => {
      throw new Error('render failed');
    });

    await expect(prepareArticlePdf(post, { compileImpl: firstCompile }))
      .rejects.toThrow('render failed');
    expect(pdfRenderState(post)).toMatchObject({
      ready: false,
      preparing: false
    });

    const pdf = Buffer.from('%PDF-retry-test');
    const retryCompile = globalThis.vi.fn(async () => pdf);
    await expect(prepareArticlePdf(post, { compileImpl: retryCompile }))
      .resolves.toEqual(pdf);
    expect(retryCompile).toHaveBeenCalledOnce();
    expect(pdfRenderState(post).ready).toBe(true);
  });
});
