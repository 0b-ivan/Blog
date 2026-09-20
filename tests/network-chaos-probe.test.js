const {
  boundedInteger,
  percentile,
  summarizeSamples,
  withCacheBuster
} = require('../scripts/network-chaos-probe');

describe('NetworkChaos request probe', () => {
  it('calculates nearest-rank latency percentiles deterministically', () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

    expect(percentile(values, 0.50)).toBe(500);
    expect(percentile(values, 0.95)).toBe(1000);
    expect(percentile(values, 0.99)).toBe(1000);
    expect(percentile([], 0.95)).toBe(0);
  });

  it('summarizes checks, failures and latency distribution', () => {
    const summary = summarizeSamples([
      { ok: true, latencyMs: 100 },
      { ok: true, latencyMs: 200 },
      { ok: false, latencyMs: 500 },
      { ok: true, latencyMs: 300 }
    ]);

    expect(summary).toEqual({
      checks: 4,
      failures: 1,
      failureRatePercent: 25,
      latencyMs: {
        min: 100,
        avg: 275,
        p50: 200,
        p95: 500,
        p99: 500,
        max: 500
      }
    });
  });

  it('adds a probe cache buster without losing the actual search query', () => {
    const target = new URL(withCacheBuster(
      'https://staging-blog.obivan.org/api/search?q=Kubernetes&limit=3'
    ));

    expect(target.searchParams.get('q')).toBe('Kubernetes');
    expect(target.searchParams.get('limit')).toBe('3');
    expect(target.searchParams.get('_chaos_probe')).toMatch(/^\d+$/);
  });

  it('bounds probe configuration to safe ranges', () => {
    expect(boundedInteger('20000', 1000, 1000, 60000)).toBe(20000);
    expect(boundedInteger('999999', 1000, 1000, 60000)).toBe(60000);
    expect(boundedInteger('1', 1000, 1000, 60000)).toBe(1000);
    expect(boundedInteger('invalid', 1000, 1000, 60000)).toBe(1000);
  });
});
