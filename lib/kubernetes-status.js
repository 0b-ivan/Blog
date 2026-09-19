function sanitizedKubernetesStatus(payload) {
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
      : []
  };
}

module.exports = {
  sanitizedKubernetesStatus
};
