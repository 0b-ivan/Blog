const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { URL, URLSearchParams } = require('node:url');

const root = path.resolve(__dirname, '..');
const DEFAULT_LANGUAGE = 'de-DE';
const DEFAULT_LANGUAGETOOL_URL = 'http://127.0.0.1:8010/v2/check';
const SAFE_ISSUE_TYPES = new Set(['misspelling', 'typographical']);
const MAX_GITHUB_ANNOTATIONS = 50;

function blankRange(chars, start, end) {
  for (let index = start; index < end && index < chars.length; index += 1) {
    if (chars[index] !== '\n' && chars[index] !== '\r') {
      chars[index] = ' ';
    }
  }
}

function maskMarkdown(source) {
  const chars = source.split('');

  const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (frontmatter) {
    blankRange(chars, 0, frontmatter[0].length);
  }

  let offset = 0;
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (const line of source.match(/.*(?:\r?\n|$)/g) || []) {
    if (!line) {
      continue;
    }

    const content = line.replace(/\r?\n$/, '');
    const marker = content.match(/^\s*(`{3,}|~{3,})/);

    if (!inFence && marker) {
      inFence = true;
      fenceChar = marker[1][0];
      fenceLength = marker[1].length;
      blankRange(chars, offset, offset + line.length);
    } else if (inFence) {
      blankRange(chars, offset, offset + line.length);
      const closing = content.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (
        closing &&
        closing[1][0] === fenceChar &&
        closing[1].length >= fenceLength
      ) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
      }
    }

    offset += line.length;
  }

  const maskRegex = (regex, rangeFromMatch) => {
    for (const match of source.matchAll(regex)) {
      const range = rangeFromMatch(match);
      blankRange(chars, range.start, range.end);
    }
  };

  maskRegex(/`[^`\n]*`/g, (match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));

  maskRegex(/\]\(([^)\n]+)\)/g, (match) => ({
    start: match.index + 2,
    end: match.index + match[0].length - 1
  }));

  maskRegex(/https?:\/\/[^\s<>)]+/g, (match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));

  maskRegex(/<[^>\n]+>/g, (match) => ({
    start: match.index,
    end: match.index + match[0].length
  }));

  return chars.join('');
}

async function collectMarkdownFiles(targets) {
  const requested = targets.length ? targets : ['posts'];
  const files = [];

  async function visit(targetPath) {
    const absolute = path.resolve(root, targetPath);
    let stat;

    try {
      stat = await fs.stat(absolute);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(`Proofread target not found: ${targetPath}`);
      }
      throw error;
    }

    if (stat.isFile()) {
      if (absolute.endsWith('.md')) {
        files.push(absolute);
      }
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      await visit(path.join(path.relative(root, absolute), entry.name));
    }
  }

  for (const target of requested) {
    await visit(target);
  }

  return [...new Set(files)].sort();
}

async function loadIgnoredWords() {
  const dictionaryPath = path.join(root, 'config', 'proofread-words.txt');
  let raw = '';

  try {
    raw = await fs.readFile(dictionaryPath, 'utf-8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.toLocaleLowerCase('de-DE'))
  );
}

function normalizeMatchedText(value) {
  return String(value || '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.+-]+$/gu, '')
    .toLocaleLowerCase('de-DE');
}

function isIgnoredMatch(source, match, ignoredWords) {
  const fragment = source.slice(match.offset, match.offset + match.length);
  return ignoredWords.has(normalizeMatchedText(fragment));
}

function requestLanguageTool(text, endpoint, language = DEFAULT_LANGUAGE) {
  const url = new URL(endpoint);
  const body = new URLSearchParams({ language, text }).toString();
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf-8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`LanguageTool returned HTTP ${response.statusCode || 'unknown'}: ${responseBody.slice(0, 300)}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            reject(new Error(`Could not parse LanguageTool response: ${error.message}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function lineColumnAt(source, offset) {
  const before = source.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function issueLabel(match) {
  const ruleId = match.rule?.id || 'LanguageTool';
  const issueType = match.rule?.issueType || 'suggestion';
  return `${ruleId}/${issueType}`;
}

function safeFixCandidates(source, matches, ignoredWords) {
  return matches
    .filter((match) => !isIgnoredMatch(source, match, ignoredWords))
    .filter((match) => SAFE_ISSUE_TYPES.has(match.rule?.issueType))
    .filter((match) => Array.isArray(match.replacements) && match.replacements.length === 1)
    .map((match) => ({
      start: match.offset,
      end: match.offset + match.length,
      replacement: match.replacements[0].value,
      match
    }))
    .filter((fix) => fix.replacement !== source.slice(fix.start, fix.end))
    .sort((a, b) => b.start - a.start);
}

function applySafeFixes(source, matches, ignoredWords = new Set()) {
  let output = source;
  let previousStart = Number.POSITIVE_INFINITY;
  const applied = [];

  for (const fix of safeFixCandidates(source, matches, ignoredWords)) {
    if (fix.end > previousStart) {
      continue;
    }

    output = `${output.slice(0, fix.start)}${fix.replacement}${output.slice(fix.end)}`;
    previousStart = fix.start;
    applied.push(fix);
  }

  return { text: output, applied };
}

function githubEscape(value, property = false) {
  let output = String(value || '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');

  if (property) {
    output = output.replace(/:/g, '%3A').replace(/,/g, '%2C');
  }

  return output;
}

function printIssue(file, source, match, annotationState) {
  const relative = path.relative(root, file);
  const position = lineColumnAt(source, match.offset);
  const fragment = source.slice(match.offset, match.offset + match.length).replace(/\s+/g, ' ').trim();
  const replacements = (match.replacements || []).slice(0, 3).map((item) => item.value).filter(Boolean);

  console.log(`${relative}:${position.line}:${position.column} [${issueLabel(match)}] ${match.message}`);
  if (fragment) {
    console.log(`  Text: ${JSON.stringify(fragment)}`);
  }
  if (replacements.length) {
    console.log(`  Vorschlag: ${replacements.join(' | ')}`);
  }

  if (process.env.GITHUB_ACTIONS === 'true' && annotationState.count < MAX_GITHUB_ANNOTATIONS) {
    annotationState.count += 1;
    const title = githubEscape(issueLabel(match), true);
    const message = githubEscape(`${match.message}${replacements.length ? ` Vorschlag: ${replacements.join(' | ')}` : ''}`);
    console.log(
      `::warning file=${githubEscape(relative, true)},line=${position.line},col=${position.column},title=${title}::${message}`
    );
  }
}

async function appendGithubSummary(summary) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf-8');
}

async function run() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const targets = args.filter((arg) => arg !== '--fix');
  const endpoint = process.env.LANGUAGETOOL_URL || DEFAULT_LANGUAGETOOL_URL;
  const language = process.env.PROOFREAD_LANGUAGE || DEFAULT_LANGUAGE;
  const ignoredWords = await loadIgnoredWords();
  const files = await collectMarkdownFiles(targets);

  if (!files.length) {
    console.log('No Markdown files found for proofreading.');
    return;
  }

  let totalIssues = 0;
  let totalApplied = 0;
  const annotationState = { count: 0 };

  for (const file of files) {
    const source = await fs.readFile(file, 'utf-8');
    const masked = maskMarkdown(source);
    const result = await requestLanguageTool(masked, endpoint, language);
    const matches = (result.matches || []).filter((match) => !isIgnoredMatch(source, match, ignoredWords));

    totalIssues += matches.length;

    if (matches.length) {
      console.log(`\n${path.relative(root, file)}: ${matches.length} Hinweis(e)`);
      for (const match of matches) {
        printIssue(file, source, match, annotationState);
      }
    }

    if (fix && matches.length) {
      const corrected = applySafeFixes(source, matches, ignoredWords);
      if (corrected.applied.length) {
        await fs.writeFile(file, corrected.text, 'utf-8');
        totalApplied += corrected.applied.length;
        console.log(`  Auto-korrigiert: ${corrected.applied.length}`);
      }
    }
  }

  const summaryLines = [
    '## Proofread Blog Posts',
    '',
    `- Dateien: ${files.length}`,
    `- LanguageTool-Hinweise: ${totalIssues}`,
    `- automatisch angewendet: ${totalApplied}`,
    '',
    'Autocorrect wendet nur eindeutige Rechtschreib-/Typografie-Korrekturen mit genau einem Vorschlag an. Grammatik- und Stilhinweise bleiben zur manuellen Prüfung stehen.'
  ];

  await appendGithubSummary(summaryLines.join('\n'));

  console.log(`\nProofread summary: ${files.length} file(s), ${totalIssues} issue(s), ${totalApplied} auto-fix(es).`);

  if (!fix && totalIssues > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Proofreading failed: ${error.message}`);
    process.exitCode = 2;
  });
}

module.exports = {
  SAFE_ISSUE_TYPES,
  maskMarkdown,
  normalizeMatchedText,
  isIgnoredMatch,
  safeFixCandidates,
  applySafeFixes,
  lineColumnAt
};
