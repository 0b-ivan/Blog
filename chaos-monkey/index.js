const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');

const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

const chaosTarget = process.env.CHAOS_TARGET || 'blog';
const expectedReplicas = Number.parseInt(process.env.EXPECTED_REPLICAS || '3', 10);
const expectedBlogReplicas = Number.parseInt(process.env.EXPECTED_BLOG_REPLICAS || '3', 10);
const recoveryTimeoutMs = Number.parseInt(process.env.RECOVERY_TIMEOUT_MS || '120000', 10);
const healthIntervalMs = Number.parseInt(process.env.HEALTH_INTERVAL_MS || '500', 10);
const settleDelayMs = Number.parseInt(process.env.SETTLE_DELAY_MS || '2000', 10);
const searchProbeTimeoutMs = Number.parseInt(process.env.SEARCH_PROBE_TIMEOUT_MS || '3000', 10);
const iterationCount = Number.parseInt(process.env.CHAOS_ITERATIONS || '1', 10);
const healthUrl = process.env.HEALTH_URL || 'https://staging-blog.obivan.org/healthz';
const searchUrl = process.env.SEARCH_URL || 'https://staging-blog.obivan.org/api/search';
const requiredJobPrefix = 'chaos-monkey-manual-';
const resultConfigMapName = process.env.RESULT_CONFIGMAP || 'chaos-monkey-result';
const maximumIterations = 3;

const targetConfigs = {
  blog: {
    app: 'blog',
    container: 'blog'
  },
  search: {
    app: 'search',
    container: 'search'
  }
};

function readRequiredFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function log(event, data = {}) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data
  })}\n`);
}

function targetConfig() {
  const config = targetConfigs[chaosTarget];
  if (!config) {
    throw new Error(`unsupported CHAOS_TARGET: ${chaosTarget}`);
  }
  return config;
}

function k8sRequest(method, pathname, payload = null, contentType = 'application/json') {
  const token = readRequiredFile(tokenPath);
  const ca = fs.readFileSync(caPath);
  const host = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
  const port = Number.parseInt(process.env.KUBERNETES_SERVICE_PORT_HTTPS || '443', 10);
  const body = payload === null ? null : JSON.stringify(payload);
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  };
  if (body !== null) headers['Content-Type'] = contentType;

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: host,
      port,
      path: pathname,
      method,
      ca,
      headers,
      timeout: 5000
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Kubernetes API ${method} ${pathname} returned HTTP ${response.statusCode}: ${responseBody.slice(0, 300)}`));
          return;
        }
        resolve(responseBody ? JSON.parse(responseBody) : {});
      });
    });

    request.on('timeout', () => request.destroy(new Error('Kubernetes API timeout')));
    request.on('error', reject);
    request.end(body || undefined);
  });
}

function podReady(pod) {
  if (pod?.metadata?.deletionTimestamp) return false;
  return Array.isArray(pod?.status?.conditions)
    && pod.status.conditions.some((condition) => condition.type === 'Ready' && condition.status === 'True');
}

function validateEligiblePod(pod, config) {
  const labels = pod?.metadata?.labels || {};
  const owners = Array.isArray(pod?.metadata?.ownerReferences) ? pod.metadata.ownerReferences : [];
  const containers = Array.isArray(pod?.spec?.containers) ? pod.spec.containers : [];

  if (labels.app !== config.app) throw new Error(`eligible pod is not app=${config.app}`);
  if (labels['chaos.obivan.org/enabled'] !== 'true') throw new Error('eligible pod is missing chaos opt-in');
  if (!owners.some((owner) => owner.kind === 'ReplicaSet' && owner.controller === true)) {
    throw new Error('eligible pod is not controlled by a ReplicaSet');
  }
  if (!containers.some((container) => container.name === config.container)) {
    throw new Error(`eligible pod does not contain the ${config.container} container`);
  }
}

async function listPods(namespace, selector) {
  const response = await k8sRequest(
    'GET',
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=${encodeURIComponent(selector)}`
  );
  return Array.isArray(response.items) ? response.items : [];
}

async function listEligiblePods(namespace, config) {
  return listPods(namespace, `app=${config.app},chaos.obivan.org/enabled=true`);
}

async function publicHealth() {
  try {
    const response = await fetch(healthUrl, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(4000)
    });
    return response.ok && (await response.text()).trim() === 'ok';
  } catch (_error) {
    return false;
  }
}

async function searchReachable(timeoutMs = 10000) {
  try {
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'Docker', limit: 1 }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return Array.isArray(payload.results) && payload.results.length > 0;
  } catch (_error) {
    return false;
  }
}

function experimentName() {
  if (chaosTarget === 'search') return 'search-restart-under-load';
  return iterationCount === 1 ? 'single-blog-pod-delete' : 'repeated-blog-pod-delete';
}

function sanitizedExperimentResult(result) {
  return {
    experiment: result.experiment,
    target: result.target,
    experimentStartedAt: result.experimentStartedAt,
    completedAt: result.completedAt,
    iterationCount: result.iterationCount,
    completedIterations: result.completedIterations,
    recoveryTimeMs: result.maxRecoveryTimeMs,
    recoveryTimesMs: result.recoveryTimesMs,
    totalRecoveryTimeMs: result.totalRecoveryTimeMs,
    maxRecoveryTimeMs: result.maxRecoveryTimeMs,
    kubernetesRecoveryTimeMs: result.kubernetesRecoveryTimeMs || 0,
    httpChecks: result.httpChecks,
    httpFailures: result.httpFailures,
    searchChecks: result.searchChecks || 0,
    searchFailures: result.searchFailures || 0,
    firstSearchFailureMs: result.firstSearchFailureMs || 0,
    searchRecoveredAfterFailureMs: result.searchRecoveredAfterFailureMs || 0,
    observedSearchOutageMs: result.observedSearchOutageMs || 0,
    minimumReadyPods: result.minimumReadyPods,
    maximumReadyPods: result.maximumReadyPods,
    searchReachableBefore: result.searchReachableBefore === true,
    searchReachableAfter: result.searchReachableAfter === true,
    passed: result.passed === true
  };
}

async function publishResult(namespace, result) {
  const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${encodeURIComponent(resultConfigMapName)}`;
  await k8sRequest(
    'PATCH',
    path,
    { data: { result: JSON.stringify(sanitizedExperimentResult(result)) } },
    'application/merge-patch+json'
  );
}

async function preflight(namespace, config) {
  const pods = await listEligiblePods(namespace, config);
  pods.forEach((pod) => validateEligiblePod(pod, config));

  const ready = pods.filter(podReady).length;
  if (pods.length !== expectedReplicas || ready !== expectedReplicas) {
    throw new Error(
      `preflight failed: expected exactly ${expectedReplicas}/${expectedReplicas} eligible ready ${config.app} pods, got ${ready}/${pods.length}`
    );
  }

  if (chaosTarget === 'search') {
    const blogPods = await listPods(namespace, 'app=blog');
    const readyBlogs = blogPods.filter(podReady).length;
    if (blogPods.length !== expectedBlogReplicas || readyBlogs !== expectedBlogReplicas) {
      throw new Error(
        `preflight failed: expected exactly ${expectedBlogReplicas}/${expectedBlogReplicas} ready blog pods before search chaos, got ${readyBlogs}/${blogPods.length}`
      );
    }
  }

  if (!(await publicHealth())) {
    throw new Error('preflight failed: public health endpoint is not healthy');
  }

  return pods;
}

async function deletePod(namespace, podName) {
  await k8sRequest(
    'DELETE',
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}?gracePeriodSeconds=0`
  );
}

async function runBlogIteration(namespace, config, iteration) {
  const before = await preflight(namespace, config);
  const victim = before[crypto.randomInt(before.length)];
  const victimName = victim.metadata.name;
  const deletionStartedAt = Date.now();

  log('iteration_started', {
    target: chaosTarget,
    iteration,
    iterationCount,
    namespace,
    expectedReplicas,
    victim: victimName
  });

  await deletePod(namespace, victimName);

  let httpChecks = 0;
  let httpFailures = 0;
  let minimumReadyPods = expectedReplicas;
  let maximumReadyPods = expectedReplicas;
  let recovered = false;

  while (Date.now() - deletionStartedAt < recoveryTimeoutMs) {
    const [pods, health] = await Promise.all([
      listEligiblePods(namespace, config),
      publicHealth()
    ]);

    pods.forEach((pod) => validateEligiblePod(pod, config));
    const ready = pods.filter(podReady).length;
    minimumReadyPods = Math.min(minimumReadyPods, ready);
    maximumReadyPods = Math.max(maximumReadyPods, ready);
    httpChecks += 1;
    if (!health) httpFailures += 1;

    if (pods.length === expectedReplicas && ready === expectedReplicas) {
      recovered = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, healthIntervalMs));
  }

  const recoveryTimeMs = Date.now() - deletionStartedAt;
  log('iteration_result', {
    target: chaosTarget,
    iteration,
    recovered,
    recoveryTimeMs,
    httpChecks,
    httpFailures,
    minimumReadyPods,
    maximumReadyPods,
    victim: victimName
  });

  return {
    recovered,
    recoveryTimeMs,
    httpChecks,
    httpFailures,
    minimumReadyPods,
    maximumReadyPods
  };
}

async function runSearchExperiment(namespace, config, experimentStartedAt, searchBefore) {
  const before = await preflight(namespace, config);
  const victim = before[0];
  const victimName = victim.metadata.name;
  const deletionStartedAt = Date.now();

  log('search_experiment_started', {
    experiment: experimentName(),
    experimentStartedAt,
    namespace,
    target: chaosTarget,
    expectedReplicas,
    victim: victimName
  });

  await deletePod(namespace, victimName);

  let httpChecks = 0;
  let httpFailures = 0;
  let searchChecks = 0;
  let searchFailures = 0;
  let minimumReadyPods = expectedReplicas;
  let maximumReadyPods = expectedReplicas;
  let kubernetesRecoveryTimeMs = 0;
  let firstSearchFailureMs = 0;
  let searchRecoveredAfterFailureMs = 0;
  let sawSearchFailure = false;
  let recovered = false;

  while (Date.now() - deletionStartedAt < recoveryTimeoutMs) {
    const [pods, health, searchOk] = await Promise.all([
      listEligiblePods(namespace, config),
      publicHealth(),
      searchReachable(searchProbeTimeoutMs)
    ]);

    pods.forEach((pod) => validateEligiblePod(pod, config));
    const ready = pods.filter(podReady).length;
    const elapsedMs = Date.now() - deletionStartedAt;

    minimumReadyPods = Math.min(minimumReadyPods, ready);
    maximumReadyPods = Math.max(maximumReadyPods, ready);

    httpChecks += 1;
    if (!health) httpFailures += 1;

    searchChecks += 1;
    if (!searchOk) {
      searchFailures += 1;
      if (!sawSearchFailure) {
        sawSearchFailure = true;
        firstSearchFailureMs = elapsedMs;
      }
    } else if (sawSearchFailure && searchRecoveredAfterFailureMs === 0) {
      searchRecoveredAfterFailureMs = elapsedMs;
    }

    if (pods.length === expectedReplicas && ready === expectedReplicas && kubernetesRecoveryTimeMs === 0) {
      kubernetesRecoveryTimeMs = elapsedMs;
    }

    if (pods.length === expectedReplicas && ready === expectedReplicas && searchOk) {
      recovered = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, healthIntervalMs));
  }

  const recoveryTimeMs = Date.now() - deletionStartedAt;
  const searchAfter = await searchReachable();
  const observedSearchOutageMs = sawSearchFailure && searchRecoveredAfterFailureMs >= firstSearchFailureMs
    ? searchRecoveredAfterFailureMs - firstSearchFailureMs
    : 0;

  const result = {
    experiment: experimentName(),
    target: chaosTarget,
    experimentStartedAt,
    completedAt: new Date().toISOString(),
    iterationCount: 1,
    completedIterations: recovered ? 1 : 0,
    recoveryTimesMs: [recoveryTimeMs],
    totalRecoveryTimeMs: recoveryTimeMs,
    maxRecoveryTimeMs: recoveryTimeMs,
    kubernetesRecoveryTimeMs,
    httpChecks,
    httpFailures,
    searchChecks,
    searchFailures,
    firstSearchFailureMs,
    searchRecoveredAfterFailureMs,
    observedSearchOutageMs,
    minimumReadyPods,
    maximumReadyPods,
    searchReachableBefore: searchBefore,
    searchReachableAfter: searchAfter,
    passed: recovered
      && httpFailures === 0
      && searchBefore
      && searchAfter
  };

  log('experiment_result', {
    ...result,
    victim: victimName
  });

  return { result, recovered };
}

async function runBlogExperiment(namespace, config, experimentStartedAt, searchBefore) {
  const recoveryTimesMs = [];
  let completedIterations = 0;
  let httpChecks = 0;
  let httpFailures = 0;
  let minimumReadyPods = expectedReplicas;
  let maximumReadyPods = expectedReplicas;
  let allRecovered = true;

  for (let iteration = 1; iteration <= iterationCount; iteration += 1) {
    const iterationResult = await runBlogIteration(namespace, config, iteration);
    recoveryTimesMs.push(iterationResult.recoveryTimeMs);
    httpChecks += iterationResult.httpChecks;
    httpFailures += iterationResult.httpFailures;
    minimumReadyPods = Math.min(minimumReadyPods, iterationResult.minimumReadyPods);
    maximumReadyPods = Math.max(maximumReadyPods, iterationResult.maximumReadyPods);

    if (!iterationResult.recovered) {
      allRecovered = false;
      break;
    }

    completedIterations += 1;

    if (iteration < iterationCount) {
      await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
    }
  }

  const searchAfter = await searchReachable();
  const totalRecoveryTimeMs = recoveryTimesMs.reduce((sum, value) => sum + value, 0);
  const maxRecoveryTimeMs = recoveryTimesMs.length ? Math.max(...recoveryTimesMs) : 0;
  const result = {
    experiment: experimentName(),
    target: chaosTarget,
    experimentStartedAt,
    completedAt: new Date().toISOString(),
    iterationCount,
    completedIterations,
    recoveryTimesMs,
    totalRecoveryTimeMs,
    maxRecoveryTimeMs,
    kubernetesRecoveryTimeMs: maxRecoveryTimeMs,
    httpChecks,
    httpFailures,
    searchChecks: 0,
    searchFailures: 0,
    firstSearchFailureMs: 0,
    searchRecoveredAfterFailureMs: 0,
    observedSearchOutageMs: 0,
    minimumReadyPods,
    maximumReadyPods,
    searchReachableBefore: searchBefore,
    searchReachableAfter: searchAfter,
    passed: allRecovered
      && completedIterations === iterationCount
      && httpFailures === 0
      && searchBefore
      && searchAfter
  };

  log('experiment_result', result);
  return { result, recovered: allRecovered };
}

async function main() {
  const namespace = readRequiredFile(namespacePath);
  const podName = process.env.POD_NAME || '';
  const config = targetConfig();

  if (namespace !== 'blog-staging') {
    throw new Error(`refusing chaos outside blog-staging (current namespace: ${namespace})`);
  }

  if (!podName.startsWith(requiredJobPrefix)) {
    throw new Error(
      `refusing non-manual execution: pod name must start with ${requiredJobPrefix}`
    );
  }

  if (!Number.isInteger(iterationCount) || iterationCount < 1 || iterationCount > maximumIterations) {
    throw new Error(`CHAOS_ITERATIONS must be between 1 and ${maximumIterations}`);
  }

  if (chaosTarget === 'search' && iterationCount !== 1) {
    throw new Error('search chaos supports exactly one iteration');
  }

  const experimentStartedAt = new Date().toISOString();
  await preflight(namespace, config);
  const searchBefore = await searchReachable();
  if (!searchBefore) {
    throw new Error('preflight failed: search API is not healthy');
  }

  log('experiment_started', {
    experiment: experimentName(),
    experimentStartedAt,
    namespace,
    target: chaosTarget,
    expectedReplicas,
    iterationCount,
    searchReachableBefore: searchBefore
  });

  const execution = chaosTarget === 'search'
    ? await runSearchExperiment(namespace, config, experimentStartedAt, searchBefore)
    : await runBlogExperiment(namespace, config, experimentStartedAt, searchBefore);

  await publishResult(namespace, execution.result);

  if (!execution.recovered) {
    throw new Error(`recovery timeout after ${execution.result.maxRecoveryTimeMs} ms`);
  }

  if (!execution.result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log('experiment_aborted', {
    error: error.message || String(error),
    passed: false
  });
  process.exitCode = 1;
});
