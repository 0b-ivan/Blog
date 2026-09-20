const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('Chaos Mesh staging safety contract', () => {
  const manifest = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'staging', 'chaos-mesh.yaml'),
    'utf8'
  );
  const namespaceManifest = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'staging', 'blog.yaml'),
    'utf8'
  );
  const kustomization = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'staging', 'kustomization.yaml'),
    'utf8'
  );

  it('pins Chaos Mesh and keeps fault injection opt-in for staging', () => {
    expect(manifest).toContain('version: "2.8.4"');
    expect(manifest).toContain('clusterScoped: true');
    expect(manifest).toContain('enableFilterNamespace: true');
    expect(namespaceManifest).toContain('name: blog-staging');
    expect(namespaceManifest).toContain('chaos-mesh.org/inject: enabled');
  });

  it('uses the K3s containerd socket without exposing the dashboard', () => {
    expect(manifest).toContain('runtime: containerd');
    expect(manifest).toContain('socketPath: /run/k3s/containerd/containerd.sock');
    expect(manifest).toContain('dashboard:');
    expect(manifest).toContain('dnsServer:');
    expect(manifest.match(/create: false/g)).toHaveLength(2);
  });

  it('keeps the platform manifest free of embedded fault objects', () => {
    expect(kustomization).toContain('- chaos-mesh.yaml');
    expect(manifest).not.toContain('kind: NetworkChaos');
  });

  it('guards the active measured one-shot delay experiment', () => {
    const experiment = fs.readFileSync(
      path.join(root, 'infra', 'kubernetes', 'staging', 'chaos-experiment-network-delay-measured.yaml'),
      'utf8'
    );

    expect(kustomization).toContain('- chaos-experiment-network-delay-measured.yaml');
    expect(experiment).toContain('kind: NetworkChaos');
    expect(experiment).toContain('namespace: blog-staging');
    expect(experiment).toContain('action: delay');
    expect(experiment).toContain('duration: "30s"');
    expect(experiment).toContain('latency: "500ms"');
    expect(experiment).toContain('direction: to');
    expect(experiment.match(/app: blog/g)).toHaveLength(1);
    expect(experiment.match(/app: search/g)).toHaveLength(1);
    expect(experiment.match(/chaos\.obivan\.org\/enabled: "true"/g)).toHaveLength(2);
    expect(experiment).not.toContain('externalTargets:');
  });
});
