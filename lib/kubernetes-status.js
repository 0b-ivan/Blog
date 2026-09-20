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

function sanitizedRecoveryTimes(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item) => boundedNumber(item));
}

function sanitizedChaosExperiment(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const allowedExperiments = [
    'single-blog-pod-delete',
    'repeated-blog-pod-delete',
    'search-restart-under-load'
  ];
  if (!allowedExperiments.includes(payload.experiment)) return null;

  const target = payload.target === 'search' || payload.experiment === 'search-restart-under-load'
    ? 'search'
    : 'blog';
  const suppliedRecoveryTimes = sanitizedRecoveryTimes(payload.recoveryTimesMs);
  const maxRecoveryTimeMs = boundedNumber(
    payload.maxRecoveryTimeMs ?? payload.recoveryTimeMs
  );
  const recoveryTimesMs = suppliedRecoveryTimes.length
    ? suppliedRecoveryTimes
    : (maxRecoveryTimeMs > 0 ? [maxRecoveryTimeMs] : []);
  const fallbackIterations = payload.experiment === 'repeated-blog-pod-delete'
    ? recoveryTimesMs.length
    : 1;
  const iterationCount = boundedNumber(payload.iterationCount || fallbackIterations, 3);
  const completedIterations = Math.min(
    iterationCount,
    boundedNumber(payload.completedIterations ?? fallbackIterations, 3)
  );

  return {
    experiment: payload.experiment,
    target,
    experimentStartedAt: normalizedTimestamp(payload.experimentStartedAt),
    completedAt: normalizedTimestamp(payload.completedAt),
    iterationCount,
    completedIterations,
    recoveryTimeMs: maxRecoveryTimeMs,
    recoveryTimesMs,
    totalRecoveryTimeMs: boundedNumber(
      payload.totalRecoveryTimeMs
        ?? recoveryTimesMs.reduce((sum, item) => sum + item, 0),
      900000
    ),
    maxRecoveryTimeMs,
    kubernetesRecoveryTimeMs: boundedNumber(
      payload.kubernetesRecoveryTimeMs ?? maxRecoveryTimeMs
    ),
    httpChecks: boundedNumber(payload.httpChecks, 100000),
    httpFailures: boundedNumber(payload.httpFailures, 100000),
    searchChecks: boundedNumber(payload.searchChecks, 100000),
    searchFailures: boundedNumber(payload.searchFailures, 100000),
    firstSearchFailureMs: boundedNumber(payload.firstSearchFailureMs),
    searchRecoveredAfterFailureMs: boundedNumber(payload.searchRecoveredAfterFailureMs),
    observedSearchOutageMs: boundedNumber(payload.observedSearchOutageMs),
    minimumReadyPods: boundedNumber(payload.minimumReadyPods, 10),
    maximumReadyPods: boundedNumber(payload.maximumReadyPods, 10),
    searchReachableBefore: payload.searchReachableBefore === true,
    searchReachableAfter: payload.searchReachableAfter === true,
    passed: payload.passed === true
  };
}

function sanitizedKubernetesStatus(payload) {
  const chaosExperiment = sanitizedChaosExperiment(payload?.lastChaosExperiment);
  const allowedState = (value) => ['operational', 'degraded', 'unavailable'].includes(value)
    ? value
    : 'unavailable';
  const allowedEnvironment = (value) => ['production', 'staging'].includes(value)
    ? value
    : 'unknown';

  return {
    status: allowedState(payload?.status),
    environment: allowedEnvironment(payload?.environment),
    orchestrator: payload?.orchestrator === 'K3s' ? 'K3s' : 'Kubernetes',
    kubernetesApi: payload?.kubernetesApi === 'reachable' ? 'reachable' : 'unreachable',
    updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
    workloads: Array.isArray(payload?.workloads)
      ? payload.workloads.slice(0, 8).map((workload) => ({
        name: ['Blog', 'Search'].includes(workload?.name) ? workload.name : 'Workload',
        desired: Math.max(0, Number(workload?.desired) || 0),
        ready: Math.max(0, Number(workload?.ready) || 0),
        status: allowedState(workload?.status)
      }))
      : [],
    ...(chaosExperiment ? { lastChaosExperiment: chaosExperiment } : {})
  };
}

module.exports = {
  sanitizedChaosExperiment,
  sanitizedKubernetesStatus
};
