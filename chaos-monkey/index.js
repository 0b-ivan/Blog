const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');

const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

const expectedReplicas = Number.parseInt(process.env.EXPECTED_REPLICAS || '3', 10);
const recoveryTimeoutMs = Number.parseInt(process.env.RECOVERY_TIMEOUT_MS || '120000', 10);
const healthIntervalMs = Number.parseInt(process.env.HEALTH_INTERVAL_MS || '500', 10);
const settleDelayMs = Number.parseInt(process.env.SETTLE_DELAY_MS || '2000', 10);
const iterationCount = Number.parseInt(process.env.CHAOS_ITERATIONS || '1', 10);
const healthUrl = process.env.HEALTH_URL || 'https://staging-blog.obivan.org/healthz';
const searchUrl = process.env.SEARCH_URL || 'https://staging-blog.obivan.org/api/search';
const requiredJobPrefix = 'chaos-monkey-manual-';
const resultConfigMapName = process.env.RESULT_CONFIGMAP || 'chaos-monkey-result';
const maximumIterations = 3;

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

function validateEligiblePod(pod) {
  const labels = pod?.metadata?.labels || {};
  const owners = Array.isArray(pod?.metadata?.ownerReferences) ? pod.metadata.ownerReferences : [];
  const containers = Array.isArray(pod?.spec?.containers) ? pod.spec.containers : [];

  if (labels.app !== 'blog') throw new Error('eligible pod is not app=blog');
  if (labels['chaos.obivan.org/enabled'] !== 'true') throw new Error('eligible pod is missing chaos opt-in');
  if (!owners.some((owner) => owner.kind === 'ReplicaSet' && owner.controller === true)) {
    throw new Error('eligible pod is not controlled by a ReplicaSet');
  }
  if (!containers.some((container) => container.name === 'blog')) {
    throw new Error('eligible pod does not contain the blog container');
  }
}

async function listEligiblePods(namespace) {
  const selector = encodeURIComponent('app=blog,chaos.obivan.org/enabled=true');
  const response = await k8sRequest(
    'GET',
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=${selector}`
  );
  return Array.isArray(response.items) ? response.items : [];
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

async function searchReachable() {
  try {
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'Docker', limit: 1 }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return Array.isArray(payload.results) && payload.results.length > 0;
  } catch (_error) {
    return false;
  }
}

function experimentName() {
  return iterationCount === 1 ? 'single-blog-pod-delete' : 'repeated-blog-pod-delete';
}

function sanitizedExperimentResult(result) {
  return {
    experiment: experimentName(),
    experimentStartedAt: result.experimentStartedAt,
    completedAt: result.completedAt,
    iterationCount: result.iterationCount,
    completedIterations: result.completedIterations,
    recoveryTimeMs: result.maxRecoveryTimeMs,
    recoveryTimesMs: result.recoveryTimesMs,
    totalRecoveryTimeMs: result.totalRecoveryTimeMs,
    maxRecoveryTimeMs: result.maxRecoveryTimeMs,
    httpChecks: result.httpChecks,
    httpFailures: result.httpFailures,
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

async function preflight(namespace) {
  const pods = await listEligiblePods(namespace);
  pods.forEach(validateEligiblePod);

  const ready = pods.filter(podReady).length;
  if (pods.length !== expectedReplicas || ready !== expectedReplicas) {
    throw new Error(
      `preflight failed: expected exactly ${expectedReplicas}/${expectedReplicas} eligible ready blog pods, got ${ready}/${pods.length}`
    );
  }

  if (!(await publicHealth())) {
    throw new Error('preflight failed: public health endpoint is not healthy');
  }

  return pods;
}

async function runIteration(namespace, iteration) {
  const before = await preflight(namespace);
  const victim = before[crypto.randomInt(before.length)];
  const victimName = victim.metadata.name;
  const deletionStartedAt = Date.now();

  log('iteration_started', {
    iteration,
    iterationCount,
    namespace,
    expectedReplicas,
    victim: victimName
  });

  await k8sRequest(
    'DELETE',
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(victimName)}?gracePeriodSeconds=0`
  );

  let httpChecks = 0;
  let httpFailures = 0;
  let minimumReadyPods = expectedReplicas;
  let maximumReadyPods = expectedReplicas;
  let recovered = false;

  while (Date.now() - deletionStartedAt < recoveryTimeoutMs) {
    const [pods, health] = await Promise.all([
      listEligiblePods(namespace),
      publicHealth()
    ]);

    pods.forEach(validateEligiblePod);
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

async function main() {
  const namespace = readRequiredFile(namespacePath);
  const podName = process.env.POD_NAME || '';

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

  const experimentStartedAt = new Date().toISOString();
  await preflight(namespace);
  const searchBefore = await searchReachable();
  if (!searchBefore) {
    throw new Error('preflight failed: search API is not healthy');
  }

  log('experiment_started', {
    experiment: experimentName(),
    experimentStartedAt,
    namespace,
    expectedReplicas,
    iterationCount,
    searchReachableBefore: searchBefore
  });

  const recoveryTimesMs = [];
  let completedIterations = 0;
  let httpChecks = 0;
  let httpFailures = 0;
  let minimumReadyPods = expectedReplicas;
  let maximumReadyPods = expectedReplicas;
  let allRecovered = true;

  for (let iteration = 1; iteration <= iterationCount; iteration += 1) {
    const result = await runIteration(namespace, iteration);
    recoveryTimesMs.push(result.recoveryTimeMs);
    httpChecks += result.httpChecks;
    httpFailures += result.httpFailures;
    minimumReadyPods = Math.min(minimumReadyPods, result.minimumReadyPods);
    maximumReadyPods = Math.max(maximumReadyPods, result.maximumReadyPods);

    if (!result.recovered) {
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
    experimentStartedAt,
    completedAt: new Date().toISOString(),
    iterationCount,
    completedIterations,
    recoveryTimesMs,
    totalRecoveryTimeMs,
    maxRecoveryTimeMs,
    httpChecks,
    httpFailures,
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
  await publishResult(namespace, result);

  if (!allRecovered) {
    throw new Error(`recovery timeout during iteration ${completedIterations + 1}`);
  }

  if (!result.passed) {
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
