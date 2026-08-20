#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const targets = args.filter((arg) => arg !== '--fix');

if (targets.length === 0) {
  targets.push('posts/**/*.md');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cspellArgs = [
  'exec',
  '--yes',
  '--package=cspell@10.0.1',
  '--package=@cspell/dict-de-de@4.1.2',
  '--',
  'cspell',
  '--config',
  'cspell.json',
  '--no-progress',
  '--show-suggestions'
];

if (fix) {
  cspellArgs.push('--fix');
}

cspellArgs.push(...targets);

const result = spawnSync(npmCommand, cspellArgs, {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(`CSpell konnte nicht gestartet werden: ${result.error.message}`);
  process.exit(2);
}

process.exit(result.status ?? 2);
