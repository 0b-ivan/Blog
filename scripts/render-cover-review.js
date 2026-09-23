const fs = require('node:fs/promises');
const path = require('node:path');

function parseArgs(args) {
  const options = {
    reports: [],
    reportsDir: '',
    repository: '',
    commit: ''
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--report' && next) {
      options.reports.push(next);
      index += 1;
    } else if (arg === '--reports-dir' && next) {
      options.reportsDir = next;
      index += 1;
    } else if (arg === '--repository' && next) {
      options.repository = next;
      index += 1;
    } else if (arg === '--commit' && next) {
      options.commit = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  return options;
}

function markdownText(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function rawGithubUrl(repository, commit, assetPath) {
  const cleanPath = String(assetPath || '').replace(/^\/+/, '');
  if (!repository || !commit || !cleanPath) return '';
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repository}/${commit}/${encodedPath}`;
}

function candidateTable(candidates) {
  const rows = (candidates || []).slice(0, 3).map((candidate) => {
    const preview = candidate.previewURL
      ? `<img src="${candidate.previewURL}" width="220" alt="Pixabay candidate ${candidate.rank}">`
      : '–';
    const source = candidate.pageURL
      ? `[Pixabay](${candidate.pageURL})`
      : 'Pixabay';
    const reasons = markdownText((candidate.reasons || []).join(' · ')) || 'keine zusätzlichen Signale';
    const details = [
      markdownText(candidate.tags),
      candidate.user ? `by ${markdownText(candidate.user)}` : '',
      source,
      reasons
    ].filter(Boolean).join('<br>');

    return `| ${candidate.rank} | ${candidate.score}/100 | ${preview} | ${details} |`;
  });

  return [
    '| Rang | Score | Vorschau | Details |',
    '| ---: | ---: | --- | --- |',
    ...rows
  ].join('\n');
}

function renderReport(report, options = {}) {
  const title = markdownText(report.title || report.postPath || 'Artikel');
  const query = markdownText(report.query || '');
  const selected = report.selected || null;
  const lines = [
    `## ${title}`,
    '',
    `**Artikel:** \`${markdownText(report.postPath || '')}\``,
    query ? `**Pixabay-Query:** \`${query}\`` : ''
  ].filter(Boolean);

  if (selected) {
    const imageUrl = rawGithubUrl(options.repository, options.commit, selected.coverImage);
    lines.push(
      `**Ausgewählt:** Rang ${selected.rank} · **${selected.score}/100**`,
      selected.pageURL ? `**Quelle:** [Pixabay – ${markdownText(selected.tags || 'Bild')}](${selected.pageURL})` : '',
      '',
      '### Ausgewähltes Cover',
      '',
      imageUrl ? `![Cover-Vorschau: ${title}](${imageUrl})` : '_Lokale Vorschau nicht verfügbar._',
      ''
    );
  }

  lines.push(
    '<details>',
    '<summary><strong>Top-3-Kandidaten und Bewertung</strong></summary>',
    '',
    candidateTable(report.candidates || []),
    '',
    '</details>',
    ''
  );

  return lines.filter((line) => line !== undefined).join('\n');
}

async function loadReports(options) {
  const files = [...options.reports];

  if (options.reportsDir) {
    const entries = await fs.readdir(options.reportsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(path.join(options.reportsDir, entry.name));
      }
    }
  }

  const unique = [...new Set(files)].sort();
  const reports = [];
  for (const file of unique) {
    reports.push(JSON.parse(await fs.readFile(file, 'utf8')));
  }
  return reports.sort((left, right) =>
    String(left.postPath || '').localeCompare(String(right.postPath || ''), 'en')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.reports.length && !options.reportsDir) {
    throw new Error('At least one --report or --reports-dir is required');
  }
  if (!options.repository || !options.commit) {
    throw new Error('--repository and --commit are required for stable local image previews');
  }

  const reports = await loadReports(options);
  if (!reports.length) throw new Error('No cover reports found');

  const header = [
    '# Pixabay Cover Review',
    '',
    'Die Bilder wurden nach Artikelbezug bewertet. Das ausgewählte Cover ist bereits lokal im PR-Branch gespeichert; die Kandidaten darunter dienen nur der redaktionellen Kontrolle.',
    ''
  ].join('\n');

  process.stdout.write(
    `${header}${reports.map((report) => renderReport(report, options)).join('\n')}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  candidateTable,
  loadReports,
  markdownText,
  parseArgs,
  rawGithubUrl,
  renderReport
};
