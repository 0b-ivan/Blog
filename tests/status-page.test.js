const fs = require('node:fs');
const path = require('node:path');
const { sanitizedKubernetesStatus } = require('../lib/kubernetes-status');

describe('public Kubernetes status contract', () => {
  it('adds Status to the shared hardened navigation', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'privacy-server.js'), 'utf8');

    expect(source).toContain('function addStatusNavigation(html)');
    expect(source).toContain('const STATUS_LINK = \'<a href="/status">Status</a>\'');
    expect(source).toContain('addGrepNavigation(addStatusNavigation(localizeBrowserDependencies(html)))');
  });

  it('only exposes the sanitized aggregate status shape', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'production',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      updatedAt: '2026-09-19T18:00:00.000Z',
      nodeName: 'must-not-leak',
      internalIp: '10.0.0.5',
      workloads: [
        {
          name: 'Blog',
          desired: 3,
          ready: 3,
          status: 'operational',
          podNames: ['blog-secret-name']
        }
      ],
      lastChaosExperiment: {
        experiment: 'single-blog-pod-delete',
        experimentStartedAt: '2026-09-19T19:00:00.000Z',
        completedAt: '2026-09-19T19:00:02.500Z',
        recoveryTimeMs: 2500,
        httpChecks: 6,
        httpFailures: 0,
        minimumReadyPods: 2,
        maximumReadyPods: 3,
        searchReachableBefore: true,
        searchReachableAfter: true,
        passed: true,
        victim: 'must-not-leak-victim'
      }
    });

    expect(payload).toEqual({
      status: 'operational',
      environment: 'production',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      updatedAt: '2026-09-19T18:00:00.000Z',
      workloads: [
        {
          name: 'Blog',
          desired: 3,
          ready: 3,
          status: 'operational'
        }
      ],
      lastChaosExperiment: {
        experiment: 'single-blog-pod-delete',
        experimentStartedAt: '2026-09-19T19:00:00.000Z',
        completedAt: '2026-09-19T19:00:02.500Z',
        recoveryTimeMs: 2500,
        httpChecks: 6,
        httpFailures: 0,
        minimumReadyPods: 2,
        maximumReadyPods: 3,
        searchReachableBefore: true,
        searchReachableAfter: true,
        passed: true
      }
    });
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(JSON.stringify(payload)).not.toContain('10.0.0.5');
    expect(JSON.stringify(payload)).not.toContain('blog-secret-name');
    expect(JSON.stringify(payload)).not.toContain('must-not-leak-victim');
  });

  it('normalizes unexpected values instead of exposing them', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'secret-state',
      environment: 'internal-lab',
      orchestrator: 'CustomControlPlane',
      kubernetesApi: 'maybe',
      workloads: [{ name: 'InternalThing', desired: -1, ready: -2, status: 'secret-state' }]
    });

    expect(payload.status).toBe('unavailable');
    expect(payload.environment).toBe('unknown');
    expect(payload.orchestrator).toBe('Kubernetes');
    expect(payload.kubernetesApi).toBe('unreachable');
    expect(payload.workloads[0]).toEqual({
      name: 'Workload',
      desired: 0,
      ready: 0,
      status: 'unavailable'
    });
    expect(payload.lastChaosExperiment).toBeUndefined();
  });
});
