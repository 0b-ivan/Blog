const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('NetworkChaos observer safety contract', () => {
  const rbac = fs.readFileSync(
    path.join(root, 'infra', 'kubernetes', 'base', 'status-monitor.yaml'),
    'utf8'
  );
  const statusMonitor = fs.readFileSync(
    path.join(root, 'status-monitor', 'server.js'),
    'utf8'
  );
  const networkObserver = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'observe-network-chaos.yml'),
    'utf8'
  );
  const legacyObserver = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'observe-chaos-result.yml'),
    'utf8'
  );
  const requestProbe = fs.readFileSync(
    path.join(root, 'scripts', 'network-chaos-probe.js'),
    'utf8'
  );

  it('keeps NetworkChaos access read-only and namespace-local', () => {
    expect(rbac).toContain('apiGroups: ["chaos-mesh.org"]');
    expect(rbac).toContain('resources: ["networkchaos"]');
    expect(rbac).toContain('verbs: ["get", "list"]');

    const networkRule = rbac.match(
      /- apiGroups: \["chaos-mesh\.org"\][\s\S]*?verbs: \[(.*?)\]/
    );
    expect(networkRule).not.toBeNull();
    expect(networkRule[1]).not.toMatch(/create|update|patch|delete/);
  });

  it('publishes only sanitized NetworkChaos state', () => {
    expect(statusMonitor).toContain('/networkchaos');
    expect(statusMonitor).toContain('sanitizedNetworkChaosExperiment');
    expect(statusMonitor).toContain("['network-delay', 'network-loss']");
    expect(statusMonitor).toContain("['blog', 'search']");
    expect(statusMonitor).not.toContain('lastNetworkChaosExperiment: payload');
  });

  it('uses a dedicated injection, probe and recovery observer for native Chaos Mesh experiments', () => {
    expect(networkObserver).toContain('.lastNetworkChaosExperiment');
    expect(networkObserver).toContain('.allInjected == true');
    expect(networkObserver).toContain('.allRecovered == true');
    expect(networkObserver).toContain('PROBE_DURATION_MS=20000');
    expect(networkObserver).toContain('PROBE_DURATION_MS=8000');
    expect(networkObserver).toContain('searchP95DeltaMs');
    expect(networkObserver).not.toContain('delayObserved');
    expect(networkObserver).not.toContain('>=250 ms delta');
    expect(networkObserver).toContain('Configured packet loss');
    expect(networkObserver).toContain('packetLossPercent');
    expect(networkObserver).toContain('NetworkChaos-Delay wirkt auf Netzwerkpakete');
    expect(networkObserver).toContain('network-chaos-observer');
    expect(networkObserver).toContain('No matching recovered NetworkChaos');
    expect(requestProbe).toContain('p95');
    expect(requestProbe).toContain('p99');
    expect(requestProbe).toContain('applicationPassed');
    expect(legacyObserver).toContain('NetworkChaos is handled by the dedicated NetworkChaos observer.');
  });
});
