function boundedNumber(value, maximum = 300000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, number));
}

function sanitizedChaosExperiment(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.experiment !== 'single-blog-pod-delete') return null;

  return {
    experiment: 'single-blog-pod-delete',
    experimentStartedAt: typeof payload.experimentStartedAt === 'string'
      ? payload.experimentStartedAt
      : '',
    completedAt: typeof payload.completedAt === 'string' ? payload.completedAt : '',
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
