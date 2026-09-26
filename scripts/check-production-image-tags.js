const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hetznerPath = path.join(root, '.github', 'workflows', 'cd.yml');
const k3sPath = path.join(root, '.github', 'workflows', 'cd-k8s-production.yml');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function outputValue(workflow, key, source) {
  const prefix = `echo "${key}=`;
  const line = workflow.split(/\r?\n/).find((candidate) => candidate.includes(prefix));
  if (!line) {
    throw new Error(`${source}: missing ${key} output`);
  }

  const start = line.indexOf(prefix) + prefix.length;
  const end = line.indexOf('"', start);
  if (end === -1) {
    throw new Error(`${source}: malformed ${key} output`);
  }

  return line.slice(start, end);
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const hetzner = read(hetznerPath);
const k3s = read(k3sPath);

for (const [key, imageName] of [
  ['blog_image', 'blog'],
  ['search_image', 'search'],
  ['pdf_image', 'pdf']
]) {
  const hetznerTag = outputValue(hetzner, key, 'cd.yml');
  const k3sTag = outputValue(k3s, key, 'cd-k8s-production.yml');

  expect(
    hetznerTag.endsWith(':${{ github.sha }}-hetzner'),
    `Hetzner ${imageName} image must use the commit SHA with the -hetzner suffix: ${hetznerTag}`
  );
  expect(
    k3sTag.endsWith(':${{ github.sha }}'),
    `K3s ${imageName} image must keep the raw immutable commit SHA tag: ${k3sTag}`
  );
  expect(
    hetznerTag !== k3sTag,
    `Hetzner and K3s ${imageName} workflows must never publish the same image tag`
  );
}

expect(
  k3s.includes('BUILD_VERSION="${BLOG_VERSION}+${SHORT_SHA}"'),
  'K3s production build version must remain commit-specific'
);

console.log('Production image tags are isolated: K3s uses <sha>, Hetzner uses <sha>-hetzner.');
