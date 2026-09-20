const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const { URL } = require('node:url');

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(sorted.length * ratio));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function summarizeSamples(samples) {
  const list = Array.isArray(samples) ? samples : [];
  const latencies = list.map((item) => item.latencyMs).filter(Number.isFinite);
  const failures = list.filter((item) => item.ok !== true).length;
  const sum = latencies.reduce((total, item) => total + item, 0);

  return {
    checks: list.length,
    failures,
    failureRatePercent: list.length ? Number(((failures / list.length) * 100).toFixed(2)) : 0,
    latencyMs: {
      min: latencies.length ? Math.round(Math.min(...latencies)) : 0,
      avg: latencies.length ? Math.round(sum / latencies.length) : 0,
      p50: Math.round(percentile(latencies, 0.50)),
      p95: Math.round(percentile(latencies, 0.95)),
      p99: Math.round(percentile(latencies, 0.99)),
      max: latencies.length ? Math.round(Math.max(...latencies)) : 0
    }
  };
}

function withCacheBuster(value) {
  const target = new URL(value);
  target.searchParams.set('_chaos_probe', String(Date.now()));
  return target.toString();
}

async function measureRequest(url, timeoutMs) {
  const started = performance.now();
  try {
    const response = await globalThis.fetch(withCacheBuster(url), {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'kernel-notes-network-chaos-probe'
      },
      signal: globalThis.AbortSignal.timeout(timeoutMs)
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: performance.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - started,
      error: error?.name === 'TimeoutError' ? 'timeout' : 'request-failed'
    };
  }
}

async function runProbe({
  phase,
  healthUrl,
  searchUrl,
  durationMs,
  pauseMs,
  timeoutMs
}) {
  const startedAt = new Date();
  const deadline = Date.now() + durationMs;
  const healthSamples = [];
  const searchSamples = [];

  while (Date.now() < deadline) {
    const [health, search] = await Promise.all([
      measureRequest(healthUrl, timeoutMs),
      measureRequest(searchUrl, timeoutMs)
    ]);
    healthSamples.push(health);
    searchSamples.push(search);

    if (Date.now() < deadline && pauseMs > 0) {
      await sleep(Math.min(pauseMs, Math.max(0, deadline - Date.now())));
    }
  }

  const completedAt = new Date();
  const health = summarizeSamples(healthSamples);
  const search = summarizeSamples(searchSamples);

  return {
    phase,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    requestedDurationMs: durationMs,
    actualDurationMs: completedAt.getTime() - startedAt.getTime(),
    health,
    search,
    applicationPassed:
      health.checks >= 5
      && search.checks >= 5
      && health.failures === 0
      && search.failures === 0
  };
}

async function main() {
  const output = process.env.PROBE_OUTPUT || '/tmp/network-chaos-probe.json';
  const result = await runProbe({
    phase: process.env.PROBE_PHASE || 'unknown',
    healthUrl: process.env.HEALTH_URL || 'https://staging-blog.obivan.org/healthz',
    searchUrl: process.env.SEARCH_URL || 'https://staging-blog.obivan.org/api/search?q=Kubernetes&limit=3',
    durationMs: boundedInteger(process.env.PROBE_DURATION_MS, 20000, 1000, 60000),
    pauseMs: boundedInteger(process.env.PROBE_PAUSE_MS, 100, 0, 5000),
    timeoutMs: boundedInteger(process.env.PROBE_TIMEOUT_MS, 5000, 500, 30000)
  });

  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(result) + '\n');

  if (!result.applicationPassed) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  boundedInteger,
  percentile,
  summarizeSamples,
  withCacheBuster,
  measureRequest,
  runProbe
};
