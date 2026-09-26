const { setTimeout: delay } = require('node:timers/promises');
const {
  pdfCacheMaxEntries,
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

    await delay(0);
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

  it('serializes different uncached PDF renders to cap worker memory pressure', async () => {
    const firstPost = {
      slug: 'serial-render-a',
      version: 1,
      updatedAt: '2026-09-26'
    };
    const secondPost = {
      slug: 'serial-render-b',
      version: 1,
      updatedAt: '2026-09-26'
    };

    let active = 0;
    let maximumActive = 0;
    const compileImpl = globalThis.vi.fn(async (post) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(20);
      active -= 1;
      return Buffer.from(`%PDF-${post.slug}`);
    });

    const [first, second] = await Promise.all([
      prepareArticlePdf(firstPost, { compileImpl }),
      prepareArticlePdf(secondPost, { compileImpl })
    ]);

    expect(first.subarray(0, 5).toString()).toBe('%PDF-');
    expect(second.subarray(0, 5).toString()).toBe('%PDF-');
    expect(compileImpl).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });

  it('bounds the in-memory PDF cache and evicts old entries', async () => {
    const previous = process.env.PDF_CACHE_MAX_ENTRIES;
    process.env.PDF_CACHE_MAX_ENTRIES = '1';

    try {
      expect(pdfCacheMaxEntries()).toBe(1);

      const firstPost = {
        slug: 'cache-limit-a',
        version: 1,
        updatedAt: '2026-09-26'
      };
      const secondPost = {
        slug: 'cache-limit-b',
        version: 1,
        updatedAt: '2026-09-26'
      };
      const compileImpl = globalThis.vi.fn(async (post) => Buffer.from(`%PDF-${post.slug}`));

      await prepareArticlePdf(firstPost, { compileImpl });
      await prepareArticlePdf(secondPost, { compileImpl });

      expect(pdfRenderState(firstPost).ready).toBe(false);
      expect(pdfRenderState(secondPost).ready).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.PDF_CACHE_MAX_ENTRIES;
      else process.env.PDF_CACHE_MAX_ENTRIES = previous;
    }
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
