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

  it('pins Chaos Mesh and keeps fault injection staging-only', () => {
    expect(manifest).toContain('version: "2.8.4"');
    expect(manifest).toContain('clusterScoped: false');
    expect(manifest).toContain('enableFilterNamespace: true');
    expect(manifest.match(/targetNamespace: blog-staging/g)).toHaveLength(2);
    expect(namespaceManifest).toContain('chaos-mesh.org/inject: enabled');
  });

  it('uses the K3s containerd socket without exposing the dashboard', () => {
    expect(manifest).toContain('runtime: containerd');
    expect(manifest).toContain('socketPath: /run/k3s/containerd/containerd.sock');
    expect(manifest).toContain('dashboard:');
    expect(manifest).toContain('dnsServer:');
    expect(manifest.match(/create: false/g)).toHaveLength(2);
  });

  it('installs only the platform foundation and no active network fault', () => {
    expect(kustomization).toContain('- chaos-mesh.yaml');
    expect(kustomization).not.toContain('chaos-experiment-network');
    expect(manifest).not.toContain('kind: NetworkChaos');
  });
});
