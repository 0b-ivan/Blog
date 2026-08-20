#!/usr/bin/env node

const fs = require('node:fs');
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
  '--show-suggestions',
  ...targets
];

function runCSpell(captureOutput) {
  return spawnSync(npmCommand, cspellArgs, {
    ...(captureOutput ? { encoding: 'utf8' } : { stdio: 'inherit' }),
    env: process.env
  });
}

function parseSafeFixes(output) {
  const fixes = [];
  const findingPattern = /^(.+\.md):(\d+):(\d+) - Unknown word \(([^)]+)\)(?: Suggestions: \[(.*)\])?$/;

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(findingPattern);
    if (!match || !match[5]) {
      continue;
    }

    const suggestions = [...new Set(
      match[5]
        .split(',')
        .map((suggestion) => suggestion.trim().replace(/\*$/, ''))
        .filter(Boolean)
    )];

    if (suggestions.length !== 1 || suggestions[0] === match[4]) {
      continue;
    }

    fixes.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      word: match[4],
      replacement: suggestions[0]
    });
  }

  return fixes;
}

function applySafeFixes(fixes) {
  const byFile = new Map();

  for (const fixEntry of fixes) {
    if (!byFile.has(fixEntry.file)) {
      byFile.set(fixEntry.file, []);
    }
    byFile.get(fixEntry.file).push(fixEntry);
  }

  let applied = 0;

  for (const [file, fileFixes] of byFile) {
    if (!fs.existsSync(file)) {
      continue;
    }

    const original = fs.readFileSync(file, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);

    fileFixes.sort((a, b) => b.line - a.line || b.column - a.column);

    for (const fixEntry of fileFixes) {
      const lineIndex = fixEntry.line - 1;
      const columnIndex = fixEntry.column - 1;
      const sourceLine = lines[lineIndex];

      if (sourceLine === undefined) {
        continue;
      }

      const currentWord = sourceLine.slice(columnIndex, columnIndex + fixEntry.word.length);
      if (currentWord !== fixEntry.word) {
        continue;
      }

      lines[lineIndex] = `${sourceLine.slice(0, columnIndex)}${fixEntry.replacement}${sourceLine.slice(columnIndex + fixEntry.word.length)}`;
      console.log(`CSpell Autofix: ${file}:${fixEntry.line}:${fixEntry.column} ${fixEntry.word} -> ${fixEntry.replacement}`);
      applied += 1;
    }

    fs.writeFileSync(file, lines.join(eol), 'utf8');
  }

  return applied;
}

if (!fix) {
  const result = runCSpell(false);

  if (result.error) {
    console.error(`CSpell konnte nicht gestartet werden: ${result.error.message}`);
    process.exit(2);
  }

  process.exit(result.status ?? 2);
}

const result = runCSpell(true);

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  console.error(`CSpell konnte nicht gestartet werden: ${result.error.message}`);
  process.exit(2);
}

if (result.status !== 0 && result.status !== 1) {
  process.exit(result.status ?? 2);
}

const fixes = parseSafeFixes(result.stdout || '');
const applied = applySafeFixes(fixes);
console.log(`CSpell safe autocorrect: ${applied} Korrektur(en) angewendet.`);

// Exit 1 while spelling findings remain. CI treats findings as non-blocking,
// but infrastructure/runtime errors use an exit code greater than 1.
process.exit(result.status ?? 0);
