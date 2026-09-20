const fs = require('node:fs');
const path = require('node:path');
const { renderPostPage } = require('../server');
const { analyticsServiceTarget } = require('../lib/analytics-target');
const { sanitizedKubernetesStatus } = require('../lib/kubernetes-status');

describe('analytics integration', () => {
  it('renders compact public metrics and the like control in article headers', () => {
    const html = renderPostPage({
      slug: '2026-09-20-metrics-test',
      title: 'Metrics Test',
      date: '2026-09-20',
      category: 'DevOps',
      readingTime: 4,
      excerpt: 'Test',
      html: '<p>Body</p>',
      tags: []
    });

    expect(html).toContain('data-post-slug="2026-09-20-metrics-test"');
    expect(html).toContain('data-article-metric="views"');
    expect(html).toContain('data-article-metric="active"');
    expect(html).toContain('data-article-metric="completion"');
    expect(html).toContain('data-article-metric="likes"');
    expect(html).toContain('data-article-like');
    expect(html).toContain('/assets/article-analytics.js');
  });

  it('preserves analytics summary query parameters through the internal proxy target', () => {
    const target = analyticsServiceTarget('/summary?days=30');
    expect(target.pathname).toBe('/summary');
    expect(target.searchParams.get('days')).toBe('30');
  });

  it('exposes Analytics as an allowed public workload name', () => {
    const payload = sanitizedKubernetesStatus({
      status: 'operational',
      environment: 'staging',
      orchestrator: 'K3s',
      kubernetesApi: 'reachable',
      workloads: [{ name: 'Analytics', desired: 1, ready: 1, status: 'operational' }]
    });

    expect(payload.workloads[0]).toEqual({
      name: 'Analytics',
      desired: 1,
      ready: 1,
      status: 'operational'
    });
  });

  it('documents analytics storage and wires a persistent staging service', () => {
    const root = path.join(__dirname, '..');
    const privacy = fs.readFileSync(path.join(root, 'datenschutz.html'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'infra/kubernetes/base/analytics.yaml'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'privacy-server.js'), 'utf8');

    expect(privacy).toContain('Eigene Nutzungsstatistik und Likes');
    expect(privacy).toContain('spätestens 90 Tagen');
    expect(manifest).toContain('kind: PersistentVolumeClaim');
    expect(manifest).toContain('name: analytics');
    expect(server).toContain("app.post('/api/analytics/event'");
    expect(server).toContain("app.post('/api/analytics/like/:slug'");
  });
});
