#!/usr/bin/env node

const fs = require('node:fs');

const MAX_FINDINGS = 30;

function escapeCell(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function parseCSpell(output) {
  const findings = [];
  const pattern = /^(.+\.md):(\d+):(\d+) - Unknown word \(([^)]+)\)(?: Suggestions: \[(.*)\])?$/;

  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    findings.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      word: match[4],
      suggestions: String(match[5] || '')
        .split(',')
        .map((item) => item.trim().replace(/\*$/, ''))
        .filter(Boolean)
    });
  }

  return findings;
}

function parseLanguageTool(output) {
  const findings = [];
  const lines = String(output || '').split(/\r?\n/);
  const pattern = /^(.+\.md):(\d+):(\d+) \[([^\]]+)\] (.+)$/;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) {
      continue;
    }

    let text = '';
    let suggestion = '';

    for (let cursor = index + 1; cursor < lines.length && cursor <= index + 3; cursor += 1) {
      const line = lines[cursor];
      if (/^\s+Text:\s+/.test(line)) {
        text = line.replace(/^\s+Text:\s+/, '').trim();
      } else if (/^\s+Vorschlag:\s+/.test(line)) {
        suggestion = line.replace(/^\s+Vorschlag:\s+/, '').trim();
      } else if (pattern.test(line)) {
        break;
      }
    }

    findings.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      rule: match[4],
      message: match[5],
      text,
      suggestion
    });
  }

  return findings;
}

function renderReport({ cspell, languageTool, checkedFiles = [] }) {
  const total = cspell.length + languageTool.length;
  const lines = [
    '<!-- kernel-notes-proofread-summary -->',
    '## 📝 Rechtschreibung & Grammatik',
    '',
    `Geprüfte Artikel: **${checkedFiles.length}**. Die Hinweise sind **nicht blockierend**.`
  ];

  if (total === 0) {
    lines.push('', '✅ **Keine Rechtschreib- oder Grammatikprobleme gefunden.**');
    return `${lines.join('\n')}\n`;
  }

  lines.push('', `⚠️ **${total} Hinweis${total === 1 ? '' : 'e'} gefunden.**`);

  if (cspell.length) {
    lines.push(
      '',
      `### Rechtschreibung (CSpell) — ${cspell.length}`,
      '',
      '| Fundstelle | Wort | Vorschlag |',
      '|---|---|---|'
    );

    for (const finding of cspell.slice(0, MAX_FINDINGS)) {
      lines.push(
        `| \`${escapeCell(finding.file)}:${finding.line}:${finding.column}\` | \`${escapeCell(finding.word)}\` | ${escapeCell(finding.suggestions.join(', ') || '—')} |`
      );
    }
  } else {
    lines.push('', '### Rechtschreibung (CSpell)', '', '✅ Keine Probleme gefunden.');
  }

  if (languageTool.length) {
    lines.push(
      '',
      `### Grammatik & Stil (LanguageTool) — ${languageTool.length}`,
      '',
      '| Fundstelle | Text | Hinweis | Vorschlag |',
      '|---|---|---|---|'
    );

    for (const finding of languageTool.slice(0, MAX_FINDINGS)) {
      lines.push(
        `| \`${escapeCell(finding.file)}:${finding.line}:${finding.column}\` | ${escapeCell(finding.text || '—')} | ${escapeCell(finding.message)} | ${escapeCell(finding.suggestion || '—')} |`
      );
    }
  } else {
    lines.push('', '### Grammatik & Stil (LanguageTool)', '', '✅ Keine Probleme gefunden.');
  }

  if (cspell.length > MAX_FINDINGS || languageTool.length > MAX_FINDINGS) {
    lines.push('', `_Im Kommentar werden pro Prüfer maximal ${MAX_FINDINGS} Treffer gezeigt. Alle Details stehen im Check **Textprüfung**._`);
  }

  return `${lines.join('\n')}\n`;
}

function valueAfter(flag, args) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function main() {
  const args = process.argv.slice(2);
  const cspellPath = valueAfter('--cspell', args);
  const languageToolPath = valueAfter('--languagetool', args);
  const filesPath = valueAfter('--files', args);
  const outputPath = valueAfter('--output', args);

  if (!cspellPath || !languageToolPath || !outputPath) {
    throw new Error('Usage: build-proofread-pr-report.js --cspell <file> --languagetool <file> [--files <file>] --output <file>');
  }

  const cspellOutput = fs.existsSync(cspellPath) ? fs.readFileSync(cspellPath, 'utf8') : '';
  const languageToolOutput = fs.existsSync(languageToolPath) ? fs.readFileSync(languageToolPath, 'utf8') : '';
  const checkedFiles = filesPath && fs.existsSync(filesPath)
    ? fs.readFileSync(filesPath, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];

  const report = renderReport({
    cspell: parseCSpell(cspellOutput),
    languageTool: parseLanguageTool(languageToolOutput),
    checkedFiles
  });

  fs.writeFileSync(outputPath, report, 'utf8');
  process.stdout.write(report);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCSpell,
  parseLanguageTool,
  renderReport
};
