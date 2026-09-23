const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');

const root = path.join(__dirname, '..');

function parseArgs(args) {
  const options = {
    reports: [],
    reportsDir: '',
    repository: '',
    commit: '',
    selectionManifest: '',
    compact: false
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
    } else if (arg === '--selection-manifest' && next) {
      options.selectionManifest = next;
      index += 1;
    } else if (arg === '--compact') {
      options.compact = true;
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

function selectedFromPost(report, raw) {
  if (report.selected) return report.selected;

  const parsed = matter(String(raw || ''));
  const providerId = String(parsed.data.cover_provider_id || '').trim();
  const coverImage = String(parsed.data.cover_image || '').trim();
  if (!providerId || !coverImage) return null;

  const candidate = (report.candidates || []).find(
    (entry) => String(entry.id || '') === providerId
  );
  if (!candidate) return null;

  const storedScore = Number(parsed.data.cover_score);
  return {
    ...candidate,
    score: Number.isFinite(storedScore) ? storedScore : candidate.score,
    coverImage
  };
}

async function enrichSelectedFromWorkingTree(report) {
  if (report.selected || !report.postPath) return report;

  const postsRoot = path.resolve(root, 'posts');
  const target = path.resolve(root, report.postPath);
  if (!target.startsWith(`${postsRoot}${path.sep}`)) return report;

  try {
    const raw = await fs.readFile(target, 'utf8');
    const selected = selectedFromPost(report, raw);
    return selected ? { ...report, selected } : report;
  } catch (error) {
    if (error?.code === 'ENOENT') return report;
    throw error;
  }
}

function rawGithubUrl(repository, commit, assetPath) {
  const cleanPath = String(assetPath || '').replace(/^\/+/, '');
  if (!repository || !commit || !cleanPath) return '';
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repository}/${commit}/${encodedPath}`;
}

function candidateTable(candidates, options = {}) {
  const compact = options.compact === true;
  const rows = (candidates || []).slice(0, 3).map((candidate) => {
    const preview = candidate.previewURL
      ? (compact
        ? `[Vorschau](${candidate.previewURL})`
        : `<img src="${candidate.previewURL}" width="220" alt="Pixabay candidate ${candidate.rank}">`)
      : '–';
    const source = candidate.pageURL
      ? `[Pixabay](${candidate.pageURL})`
      : 'Pixabay';
    const reasons = markdownText((candidate.reasons || []).join(' · ')) || 'keine zusätzlichen Signale';
    const semantic = Number.isFinite(Number(candidate.semanticSimilarity))
      ? `E5 Artikel: ${Number(candidate.semanticSimilarity).toFixed(4)}`
      : '';
    const prototype = Number.isFinite(Number(candidate.prototypeMargin))
      ? `Konzept: ${Number(candidate.prototypeMargin) >= 0 ? '+' : ''}${Number(candidate.prototypeMargin).toFixed(4)}`
      : '';
    const heroQuality = Number.isFinite(Number(candidate.heroQualityScore))
      ? `Hero: ${Math.round(Number(candidate.heroQualityScore))}/100`
      : '';
    const heuristic = Number.isFinite(Number(candidate.heuristicScore))
      ? `Heuristik: ${Math.round(Number(candidate.heuristicScore))}/100`
      : '';

    const details = compact
      ? [
          markdownText(candidate.tags).slice(0, 180),
          semantic,
          prototype,
          heroQuality,
          candidate.user ? `by ${markdownText(candidate.user)}` : '',
          source
        ].filter(Boolean).join('<br>')
      : [
          markdownText(candidate.tags),
          semantic,
          prototype,
          heroQuality,
          heuristic,
          candidate.user ? `by ${markdownText(candidate.user)}` : '',
          candidate.searchQueries?.length
            ? `Suchpfad: ${candidate.searchQueries.map(markdownText).join(' · ')}`
            : (candidate.searchQuery ? `Suchpfad: ${markdownText(candidate.searchQuery)}` : ''),
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
  const diversity = options.selectionByPost?.get(report.postPath) || null;
  const query = markdownText(report.query || '');
  const queries = Array.isArray(report.queries)
    ? report.queries.map(markdownText).filter(Boolean)
    : [];
  const selected = report.selected || null;
  const lines = [
    `## ${title}`,
    '',
    `**Artikel:** \`${markdownText(report.postPath || '')}\``,
    report.series ? `**Serie:** \`${markdownText(report.series)}\`` : '**Serie:** keine',
    report.visualIntent ? `**Bildidee:** \`${markdownText(report.visualIntent)}\`` : '**Bildidee:** generisch',
    report.visualIntent ? `**Intent-Evidenz:** ${Number(report.visualIntentEvidence || 0)}` : '',
    report.pixabayCategory ? `**Pixabay-Kategorie:** \`${markdownText(report.pixabayCategory)}\`` : '',
    report.pixabayImageType ? `**Pixabay-Bildtyp:** \`${markdownText(report.pixabayImageType)}\`` : '',
    report.semanticModel ? `**Semantisches Ranking:** \`${markdownText(report.semanticModel)}\` · E5 ${Math.round(Number(report.semanticWeight || 0) * 100)}%` : '',
    report.semanticPrototype ? `**Konzept-Prototyp:** \`${markdownText(report.semanticPrototype)}\`` : '',
    options.compact
      ? ''
      : (queries.length
        ? `**Pixabay-Suchpfade:** ${queries.map((value) => `\`${value}\``).join(' → ')}`
        : (query ? `**Pixabay-Query:** \`${query}\`` : ''))
  ].filter(Boolean);

  if (diversity) {
    lines.push(
      `**Vielfalt:** Motiv \`${markdownText(diversity.motif)}\` · Score ${diversity.baseScore} → ${diversity.adjustedScore}`,
      diversity.sameSeriesReuse
        ? '**Wiederverwendung:** erlaubt – identisches Bild innerhalb derselben Serie'
        : (diversity.forcedDuplicate
          ? '**Wiederverwendung:** ⚠ erzwungen – alle Top-Kandidaten waren außerhalb der Serie bereits vergeben'
          : '**Wiederverwendung:** außerhalb von Serien eindeutig'),
      (!options.compact && diversity.reasons?.length)
        ? `**Diversitätsgründe:** ${diversity.reasons.map(markdownText).join(' · ')}`
        : ''
    );
  }

  if (selected) {
    const imageUrl = rawGithubUrl(options.repository, options.commit, selected.coverImage);
    lines.push(
      `**Ausgewählt:** Rang ${selected.rank} · **${selected.score}/100**`,
      Number.isFinite(Number(selected.semanticSimilarity))
        ? `**E5 Artikel-Ähnlichkeit:** ${Number(selected.semanticSimilarity).toFixed(5)}`
        : '',
      Number.isFinite(Number(selected.prototypeMargin))
        ? `**E5 Konzept-Marge:** ${Number(selected.prototypeMargin) >= 0 ? '+' : ''}${Number(selected.prototypeMargin).toFixed(5)}`
        : '',
      Number.isFinite(Number(selected.heroQualityScore))
        ? `**Hero-Qualität:** ${Math.round(Number(selected.heroQualityScore))}/100`
        : '',
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
    candidateTable(report.candidates || [], options),
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
    const report = JSON.parse(await fs.readFile(file, 'utf8'));
    reports.push(await enrichSelectedFromWorkingTree(report));
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

  let selectionByPost = new Map();
  if (options.selectionManifest) {
    const manifest = JSON.parse(await fs.readFile(options.selectionManifest, 'utf8'));
    selectionByPost = new Map(
      (manifest.selections || []).map((selection) => [selection.postPath, selection])
    );
  }
  options.selectionByPost = selectionByPost;

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
  enrichSelectedFromWorkingTree,
  loadReports,
  markdownText,
  parseArgs,
  rawGithubUrl,
  renderReport,
  selectedFromPost
};
