const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('Chaos Monkey and status RBAC safety contract', () => {
  const chaosManifest = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'staging', 'chaos-monkey.yaml'),
    'utf8'
  );
  const statusManifest = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'base', 'status-monitor.yaml'),
    'utf8'
  );
  const stagingKustomization = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'staging', 'kustomization.yaml'),
    'utf8'
  );
  const chaosSource = fs.readFileSync(
    path.join(root, 'chaos-monkey', 'index.js'),
    'utf8'
  );
  const observerWorkflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'observe-chaos-result.yml'),
    'utf8'
  );

  it('keeps the chaos job suspended and namespace-scoped', () => {
    expect(chaosManifest).toContain('namespace: blog-staging');
    expect(chaosManifest).toContain('suspend: true');
    expect(chaosManifest).toContain('resources: ["pods"]');
    expect(chaosManifest).toContain('verbs: ["get", "list", "delete"]');
    expect(chaosManifest).toContain('resourceNames: ["chaos-monkey-result"]');
    expect(chaosManifest).toContain('kustomize.toolkit.fluxcd.io/ssa: IfNotPresent');
    expect(chaosManifest).toContain('verbs: ["patch"]');
    expect(chaosManifest).not.toContain('verbs: ["create"]');
    expect(chaosManifest).not.toContain('resources: ["nodes"]');
  });

  it('requires explicit blog opt-in and manual execution', () => {
    expect(stagingKustomization).toContain('chaos.obivan.org~1enabled');
    expect(stagingKustomization.match(/chaos\.obivan\.org~1enabled/g)).toHaveLength(2);
    expect(stagingKustomization).toContain('name: search');
    expect(stagingKustomization).toContain('value: "true"');
    expect(chaosSource).toContain("namespace !== 'blog-staging'");
    expect(chaosSource).toContain("const requiredJobPrefix = 'chaos-monkey-manual-'");
    expect(chaosSource).toContain("'app=blog,chaos.obivan.org/enabled=true'");
    expect(chaosSource).toContain('const maximumIterations = 3');
    expect(chaosSource).toContain("process.env.CHAOS_ITERATIONS || '1'");
    expect(chaosSource).toContain('const before = await preflight(namespace)');
    expect(chaosSource).toContain("CHAOS_TARGET");
    expect(chaosSource).toContain("search-restart-under-load");
    expect(chaosSource).toContain("search chaos supports exactly one iteration");
    expect(chaosSource).toContain("sawSearchFailure");
    expect(chaosSource).toContain("searchFailures > 0");
  });

  it('keeps repeated experiments observable without write access', () => {
    expect(observerWorkflow).toContain("infra/kubernetes/staging/chaos-experiment-*.yaml");
    expect(observerWorkflow).toContain('repeated-blog-pod-delete');
    expect(observerWorkflow).toContain('search-restart-under-load');
    expect(observerWorkflow).toContain('Search failures');
    expect(observerWorkflow).toContain('contents: read');
    expect(observerWorkflow).not.toContain('issues: write');
    expect(observerWorkflow).not.toContain('contents: write');
  });

  it('keeps the public status exporter read-only', () => {
    expect(statusManifest).toContain('resources: ["pods"]');
    expect(statusManifest).toContain('verbs: ["get", "list"]');
    expect(statusManifest).toContain('resourceNames: ["chaos-monkey-result"]');
    expect(statusManifest).toContain('verbs: ["get"]');
    expect(statusManifest).not.toContain('verbs: ["get", "list", "delete"]');
    expect(statusManifest).not.toContain('verbs: ["patch"]');
  });
});
