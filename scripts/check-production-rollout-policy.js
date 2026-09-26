const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'cd-k8s-production.yml'),
  'utf8'
);
const production = fs.readFileSync(
  path.join(root, 'infra', 'kubernetes', 'production', 'kustomization.yaml'),
  'utf8'
);

function expectIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

expectIncludes(
  workflow,
  "if: steps.changes.outputs.search == 'true'",
  'K3s production must only rebuild Kernel Grep when search inputs changed.'
);
expectIncludes(
  workflow,
  'SEARCH_CHANGED: ${{ steps.changes.outputs.search }}',
  'GitOps publishing must know whether the search image changed.'
);
expectIncludes(
  workflow,
  'PREVIOUS_GITOPS_FILE=/tmp/kernel-notes-production-kustomization.previous.yaml',
  'Unchanged production image tags must be preserved from production-gitops.'
);
expectIncludes(
  workflow,
  'Production downtime detected',
  'The production rollout monitor must fail on a health-check outage.'
);
expectIncludes(
  workflow,
  'sleep 1',
  'Production health must be sampled every second during rollout.'
);
expectIncludes(
  workflow,
  'stable_version_checks',
  'The canary must require a stable new blog version instead of one lucky request.'
);

const nonFatalCacheExports = (
  workflow.match(/cache-to: type=gha,mode=max,scope=k3s-production-[^\n]+,ignore-error=true/g) || []
).length;
if (nonFatalCacheExports !== 4) {
  throw new Error(
    `All four K3s production image builds must tolerate GitHub Actions cache export failures; found ${nonFatalCacheExports}.`
  );
}
expectIncludes(
  production,
  'maxUnavailable: 1',
  'Single-replica production search must be allowed to stop before replacement.'
);
expectIncludes(
  production,
  'maxSurge: 0',
  'Single-replica production search must not create a second memory-heavy pod.'
);

console.log('Production rollout policy keeps search selective, memory-safe, and continuously monitored.');
