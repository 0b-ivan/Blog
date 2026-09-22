const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createApp, addNavigationCueAssets } = require('../privacy-server');
const { sanitizedKubernetesStatus } = require('../lib/kubernetes-status');

describe('public Kubernetes status contract', () => {
  it('keeps Status in the shared navigation, including the home page', async () => {
    const res = await request(createApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.text.match(/href="\/status">Status<\/a>/g)).toHaveLength(1);
    expect(res.text).toContain('/assets/nav-scroll-cue.js');
  });

  it('does not render the removed security disclosure', () => {
    const statusHtml = fs.readFileSync(path.join(__dirname, '..', 'status.html'), 'utf8');

    expect(statusHtml).not.toContain('Sicherheitsgrenze');
    expect(statusHtml).not.toContain('Was absichtlich nicht öffentlich ist');
  });

  it('injects the mobile navigation cue only once', () => {
    const html = '<html><body><header class="site-header"><nav class="main-nav"></nav></header></body></html>';
    const once = addNavigationCueAssets(html);
    const twice = addNavigationCueAssets(once);

    expect(twice.match(/\/assets\/nav-scroll-cue\.js/g)).toHaveLength(1);
  });

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
        target: 'blog',
        experimentStartedAt: '2026-09-19T19:00:00.000Z',
        completedAt: '2026-09-19T19:00:02.500Z',
        iterationCount: 1,
        completedIterations: 1,
        recoveryTimeMs: 2500,
        recoveryTimesMs: [2500],
        totalRecoveryTimeMs: 2500,
        maxRecoveryTimeMs: 2500,
        kubernetesRecoveryTimeMs: 2500,
        httpChecks: 6,
        httpFailures: 0,
        searchChecks: 0,
        searchFailures: 0,
        firstSearchFailureMs: 0,
        searchRecoveredAfterFailureMs: 0,
        observedSearchOutageMs: 0,
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

  it('sanitizes bounded repeated chaos experiment metrics', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [],
      lastChaosExperiment: {
        experiment: 'repeated-blog-pod-delete',
        experimentStartedAt: '2026-09-20T01:00:00.000Z',
        completedAt: '2026-09-20T01:00:25.000Z',
        iterationCount: 3,
        completedIterations: 3,
        recoveryTimesMs: [6950, 5800, 7200, 999999],
        totalRecoveryTimeMs: 19950,
        maxRecoveryTimeMs: 7200,
        httpChecks: 31,
        httpFailures: 0,
        minimumReadyPods: 2,
        maximumReadyPods: 3,
        searchReachableBefore: true,
        searchReachableAfter: true,
        passed: true,
        victims: ['must-not-leak-a', 'must-not-leak-b']
      }
    });

    expect(payload.lastChaosExperiment).toEqual({
      experiment: 'repeated-blog-pod-delete',
      target: 'blog',
      experimentStartedAt: '2026-09-20T01:00:00.000Z',
      completedAt: '2026-09-20T01:00:25.000Z',
      iterationCount: 3,
      completedIterations: 3,
      recoveryTimeMs: 7200,
      recoveryTimesMs: [6950, 5800, 7200],
      totalRecoveryTimeMs: 19950,
      maxRecoveryTimeMs: 7200,
      kubernetesRecoveryTimeMs: 7200,
      httpChecks: 31,
      httpFailures: 0,
      searchChecks: 0,
      searchFailures: 0,
      firstSearchFailureMs: 0,
      searchRecoveredAfterFailureMs: 0,
      observedSearchOutageMs: 0,
      minimumReadyPods: 2,
      maximumReadyPods: 3,
      searchReachableBefore: true,
      searchReachableAfter: true,
      passed: true
    });
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
  });

  it('sanitizes Search restart metrics without leaking pod identity', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [],
      lastChaosExperiment: {
        experiment: 'search-restart-under-load',
        target: 'search',
        experimentStartedAt: '2026-09-20T06:30:00.000Z',
        completedAt: '2026-09-20T06:30:18.000Z',
        iterationCount: 1,
        completedIterations: 1,
        recoveryTimesMs: [18000],
        totalRecoveryTimeMs: 18000,
        maxRecoveryTimeMs: 18000,
        kubernetesRecoveryTimeMs: 15000,
        httpChecks: 20,
        httpFailures: 0,
        searchChecks: 20,
        searchFailures: 8,
        firstSearchFailureMs: 500,
        searchRecoveredAfterFailureMs: 17500,
        observedSearchOutageMs: 17000,
        minimumReadyPods: 0,
        maximumReadyPods: 1,
        searchReachableBefore: true,
        searchReachableAfter: true,
        passed: true,
        victim: 'search-must-not-leak'
      }
    });

    expect(payload.lastChaosExperiment).toEqual({
      experiment: 'search-restart-under-load',
      target: 'search',
      experimentStartedAt: '2026-09-20T06:30:00.000Z',
      completedAt: '2026-09-20T06:30:18.000Z',
      iterationCount: 1,
      completedIterations: 1,
      recoveryTimeMs: 18000,
      recoveryTimesMs: [18000],
      totalRecoveryTimeMs: 18000,
      maxRecoveryTimeMs: 18000,
      kubernetesRecoveryTimeMs: 15000,
      httpChecks: 20,
      httpFailures: 0,
      searchChecks: 20,
      searchFailures: 8,
      firstSearchFailureMs: 500,
      searchRecoveredAfterFailureMs: 17500,
      observedSearchOutageMs: 17000,
      minimumReadyPods: 0,
      maximumReadyPods: 1,
      searchReachableBefore: true,
      searchReachableAfter: true,
      passed: true
    });
    expect(JSON.stringify(payload)).not.toContain('search-must-not-leak');
  });

  it('sanitizes aborted chaos outcomes without exposing raw errors', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [],
      lastChaosExperiment: {
        experiment: 'search-restart-under-load',
        target: 'search',
        outcome: 'aborted',
        failureStage: 'preflight',
        failureReason: 'search-api-unhealthy',
        experimentStartedAt: '2026-09-20T07:10:00.000Z',
        completedAt: '2026-09-20T07:10:01.000Z',
        iterationCount: 1,
        completedIterations: 0,
        httpChecks: 0,
        httpFailures: 0,
        searchChecks: 0,
        searchFailures: 0,
        minimumReadyPods: 0,
        maximumReadyPods: 0,
        searchReachableBefore: false,
        searchReachableAfter: false,
        passed: false,
        error: 'must-not-leak raw pod or API error'
      }
    });

    expect(payload.lastChaosExperiment.outcome).toBe('aborted');
    expect(payload.lastChaosExperiment.failureStage).toBe('preflight');
    expect(payload.lastChaosExperiment.failureReason).toBe('search-api-unhealthy');
    expect(payload.lastChaosExperiment.passed).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(JSON.stringify(payload)).not.toContain('raw pod');
  });

  it('sanitizes NetworkChaos recovery without leaking Kubernetes identities', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [],
      lastNetworkChaosExperiment: {
        experiment: 'network-delay',
        action: 'delay',
        source: 'blog',
        target: 'search',
        createdAt: '2026-09-20T15:07:30.000Z',
        completedAt: '2026-09-20T15:08:00.000Z',
        durationMs: 30000,
        latencyMs: 500,
        packetLossPercent: 0,
        selected: true,
        allInjected: true,
        allRecovered: true,
        failedEvents: 0,
        passed: true,
        podName: 'must-not-leak-pod',
        nodeName: 'must-not-leak-node',
        internalIp: '10.42.0.99'
      }
    });

    expect(payload.lastNetworkChaosExperiment).toEqual({
      experiment: 'network-delay',
      action: 'delay',
      source: 'blog',
      target: 'search',
      createdAt: '2026-09-20T15:07:30.000Z',
      completedAt: '2026-09-20T15:08:00.000Z',
      durationMs: 30000,
      latencyMs: 500,
      packetLossPercent: 0,
      selected: true,
      allInjected: true,
      allRecovered: true,
      failedEvents: 0,
      passed: true
    });
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(JSON.stringify(payload)).not.toContain('10.42.0.99');
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

    const malformedChaos = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [],
      lastChaosExperiment: {
        experiment: 'single-blog-pod-delete',
        experimentStartedAt: '<script>alert(1)</script>',
        completedAt: 'not-a-date',
        recoveryTimeMs: -5,
        httpChecks: 9999999,
        minimumReadyPods: -1,
        maximumReadyPods: 999,
        passed: 'yes'
      }
    });

    expect(malformedChaos.lastChaosExperiment.experimentStartedAt).toBe('');
    expect(malformedChaos.lastChaosExperiment.completedAt).toBe('');
    expect(malformedChaos.lastChaosExperiment.recoveryTimeMs).toBe(0);
    expect(malformedChaos.lastChaosExperiment.httpChecks).toBe(100000);
    expect(malformedChaos.lastChaosExperiment.minimumReadyPods).toBe(0);
    expect(malformedChaos.lastChaosExperiment.maximumReadyPods).toBe(10);
    expect(malformedChaos.lastChaosExperiment.passed).toBe(false);
  });
});
