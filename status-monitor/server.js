const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

const port = Number.parseInt(process.env.PORT || '8080', 10);
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
const cacheTtlMs = 2000;

let cached = null;

function readRequiredFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function workloadConfig() {
  return [
    {
      key: 'blog',
      label: 'Blog',
      desired: Number.parseInt(process.env.EXPECTED_BLOG_REPLICAS || '3', 10)
    },
    {
      key: 'search',
      label: 'Search',
      desired: Number.parseInt(process.env.EXPECTED_SEARCH_REPLICAS || '1', 10)
    }
  ];
}

function environmentName(namespace) {
  if (namespace === 'blog-production') return 'production';
  if (namespace === 'blog-staging') return 'staging';
  return 'unknown';
}

function isReady(pod) {
  if (pod?.metadata?.deletionTimestamp) return false;
  return Array.isArray(pod?.status?.conditions)
    && pod.status.conditions.some((condition) => condition.type === 'Ready' && condition.status === 'True');
}

function kubernetesRequest(pathname) {
  const token = readRequiredFile(tokenPath);
  const ca = fs.readFileSync(caPath);
  const host = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
  const apiPort = Number.parseInt(process.env.KUBERNETES_SERVICE_PORT_HTTPS || '443', 10);

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: host,
      port: apiPort,
      path: pathname,
      method: 'GET',
      ca,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      timeout: 5000
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Kubernetes API returned HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('Kubernetes API timeout')));
    request.on('error', reject);
    request.end();
  });
}

function boundedNumber(value, maximum = 300000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, number));
}

function normalizedTimestamp(value) {
  if (typeof value !== 'string') return '';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString();
}

function sanitizedChaosExperiment(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.experiment !== 'single-blog-pod-delete') return null;

  return {
    experiment: 'single-blog-pod-delete',
    experimentStartedAt: normalizedTimestamp(payload.experimentStartedAt),
    completedAt: normalizedTimestamp(payload.completedAt),
    recoveryTimeMs: boundedNumber(payload.recoveryTimeMs),
    httpChecks: boundedNumber(payload.httpChecks, 100000),
    httpFailures: boundedNumber(payload.httpFailures, 100000),
    minimumReadyPods: boundedNumber(payload.minimumReadyPods, 10),
    maximumReadyPods: boundedNumber(payload.maximumReadyPods, 10),
    searchReachableBefore: payload.searchReachableBefore === true,
    searchReachableAfter: payload.searchReachableAfter === true,
    passed: payload.passed === true
  };
}

async function readLastChaosExperiment(namespace) {
  try {
    const response = await kubernetesRequest(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/chaos-monkey-result`
    );
    const raw = response?.data?.result;
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    return sanitizedChaosExperiment(JSON.parse(raw));
  } catch (error) {
    if (error?.statusCode === 404) return null;
    console.error('chaos result lookup failed:', error.message || error);
    return null;
  }
}

async function collectStatus() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const namespace = readRequiredFile(namespacePath);
  const response = await kubernetesRequest(
    `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods`
  );
  const pods = Array.isArray(response.items) ? response.items : [];

  const workloads = workloadConfig().map((workload) => {
    const matching = pods.filter((pod) => pod?.metadata?.labels?.app === workload.key);
    const ready = matching.filter(isReady).length;
    return {
      name: workload.label,
      desired: workload.desired,
      ready,
      status: ready >= workload.desired ? 'operational' : 'degraded'
    };
  });

  const lastChaosExperiment = await readLastChaosExperiment(namespace);

  const payload = {
    status: workloads.every((workload) => workload.status === 'operational')
      ? 'operational'
      : 'degraded',
    environment: environmentName(namespace),
    orchestrator: 'K3s',
    kubernetesApi: 'reachable',
    updatedAt: new Date().toISOString(),
    workloads,
    lastChaosExperiment
  };

  cached = {
    expiresAt: now + cacheTtlMs,
    payload
  };
  return payload;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (req.url === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.url !== '/status') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  try {
    sendJson(res, 200, await collectStatus());
  } catch (error) {
    console.error('status collection failed:', error.message || error);
    sendJson(res, 503, {
      status: 'unavailable',
      environment: 'unknown',
      orchestrator: 'K3s',
      kubernetesApi: 'unreachable',
      updatedAt: new Date().toISOString(),
      workloads: []
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`kube-status listening on :${port}`);
});
