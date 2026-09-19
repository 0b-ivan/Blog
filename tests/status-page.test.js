const {
  addStatusNavigation,
  sanitizedKubernetesStatus
} = require('../privacy-server');

describe('public Kubernetes status contract', () => {
  it('adds exactly one Status entry to the main navigation', () => {
    const input = '<nav class="main-nav"><a href="/#posts">Artikel</a></nav>';
    const once = addStatusNavigation(input);
    const twice = addStatusNavigation(once);

    expect(once).toContain('<a href="/status">Status</a>');
    expect((twice.match(/href="\/status"/g) || []).length).toBe(1);
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
      ]
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
      ]
    });
    expect(JSON.stringify(payload)).not.toContain('must-not-leak');
    expect(JSON.stringify(payload)).not.toContain('10.0.0.5');
    expect(JSON.stringify(payload)).not.toContain('blog-secret-name');
  });
});
