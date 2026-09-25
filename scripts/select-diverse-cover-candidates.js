const fs = require('node:fs/promises');
const path = require('node:path');

const CLUSTERS = [
  ['writing-editing', ['writing', 'text', 'document', 'keyboard', 'spelling', 'grammar', 'proofreading', 'typewriter']],
  ['search-data', ['search', 'magnifying', 'analytics', 'artificial intelligence', 'embedding']],
  ['security', ['security', 'cyber', 'firewall', 'lock', 'padlock', 'shield', 'privacy', 'hacker']],
  ['photo-media', ['photo', 'camera', 'gallery', 'image', 'photography']],
  ['feed-news', ['rss', 'feed', 'news', 'reader', 'newspaper']],
  ['storage', ['storage', 'hard drive', 'hard drives', 'disk', 'database', 'backup', 'file', 'files', 'nas']],
  ['network', ['network', 'router', 'ethernet', 'cable', 'connection', 'lan', 'switch']],
  ['cloud', ['cloud', 'cloud computing', 'hosting']],
  ['server-infra', ['server', 'rack', 'datacenter', 'data center', 'infrastructure']],
  ['code-terminal', ['code', 'coding', 'programming', 'software', 'terminal', 'linux', 'developer']],
  ['hardware', ['hardware', 'circuit', 'electronics', 'raspberry', 'chip', 'microcontroller']],
  ['testing', ['testing', 'test', 'quality', 'automation', 'monitoring']]
];

function parseArgs(args) {
  const options = {
    reportsDir: '',
    output: '',
    selectionList: ''
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--reports-dir' && next) {
      options.reportsDir = next;
      index += 1;
    } else if (arg === '--output' && next) {
      options.output = next;
      index += 1;
    } else if (arg === '--selection-list' && next) {
      options.selectionList = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  return options;
}

function normalized(value) {
  return String(value || '').toLowerCase();
}

function containsTerm(haystack, term) {
  const normalizedHaystack = ` ${normalized(haystack).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const normalizedTerm = normalized(term).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalizedTerm ? normalizedHaystack.includes(` ${normalizedTerm} `) : false;
}

function motifCluster(tags) {
  const haystack = normalized(tags);

  for (const [name, terms] of CLUSTERS) {
    if (terms.some((term) => containsTerm(haystack, term))) return name;
  }

  return 'other';
}

async function loadReports(reportsDir) {
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(reportsDir, entry.name))
    .sort();

  const reports = [];
  for (const file of files) {
    reports.push(JSON.parse(await fs.readFile(file, 'utf8')));
  }

  return reports;
}

function sameSeries(series, usage) {
  return Boolean(series) && usage.length > 0 && usage.every((entry) => entry.series === series);
}

function unrelatedCount(usages, series) {
  return usages.filter((entry) => !(series && entry.series === series)).length;
}

function candidateAdjustment(candidate, report, state) {
  const series = String(report.series || '');
  const id = String(candidate.id || '');
  const cluster = motifCluster(candidate.tags);
  const author = normalized(candidate.user);

  const idUsage = state.ids.get(id) || [];
  const exactReuseInSeries = sameSeries(series, idUsage);
  const blockedDuplicate = idUsage.length > 0;

  const clusterUsage = state.clusters.get(cluster) || [];
  const unrelatedCluster = unrelatedCount(clusterUsage, series);
  const clusterPenalty = cluster === 'other' ? 0 : Math.min(36, unrelatedCluster * 12);

  const authorUsage = author ? (state.authors.get(author) || []) : [];
  const unrelatedAuthor = unrelatedCount(authorUsage, series);
  const authorPenalty = Math.min(12, unrelatedAuthor * 4);

  const adjustedScore = Number(candidate.score || 0) - clusterPenalty - authorPenalty;

  return {
    adjustedScore,
    author,
    authorPenalty,
    blockedDuplicate,
    cluster,
    clusterPenalty,
    exactReuseInSeries,
    id,
    unrelatedAuthor,
    unrelatedCluster
  };
}

function reportPriority(report) {
  const scores = (report.candidates || []).map((candidate) => Number(candidate.score || 0));
  const gap = scores.length > 1 ? scores[0] - scores[1] : scores[0] || 0;
  return {
    seriesFirst: report.series ? 1 : 0,
    gap
  };
}

function chooseDiverseCovers(reports) {
  const ordered = [...reports].sort((left, right) => {
    const a = reportPriority(left);
    const b = reportPriority(right);
    if (b.seriesFirst !== a.seriesFirst) return b.seriesFirst - a.seriesFirst;
    if (b.gap !== a.gap) return b.gap - a.gap;
    return String(left.postPath || '').localeCompare(String(right.postPath || ''), 'en');
  });

  const state = {
    ids: new Map(),
    clusters: new Map(),
    authors: new Map()
  };
  const selected = [];

  for (const report of ordered) {
    const candidates = report.candidates || [];
    if (!candidates.length) {
      selected.push({
        postPath: report.postPath,
        title: report.title,
        series: String(report.series || ''),
        skipped: true,
        skipReason: 'no candidates returned by Pixabay'
      });
      continue;
    }

    const heroCandidates = candidates.filter((candidate) => !candidate.heroRejected);
    if (!heroCandidates.length) {
      selected.push({
        postPath: report.postPath,
        title: report.title,
        series: String(report.series || ''),
        skipped: true,
        skipReason: 'no candidate passed the hero size/logo hard gates'
      });
      continue;
    }

    const evaluated = heroCandidates.map((candidate) => ({
      candidate,
      adjustment: candidateAdjustment(candidate, report, state)
    }));

    const semanticCandidates = evaluated.filter((entry) => !entry.candidate.semanticMismatch);
    if (!semanticCandidates.length) {
      selected.push({
        postPath: report.postPath,
        title: report.title,
        series: String(report.series || ''),
        skipped: true,
        skipReason: 'no semantically acceptable hero candidate'
      });
      continue;
    }

    const semanticFallback = false;
    const semanticPool = semanticCandidates;

    const bestBaseScore = Math.max(...semanticPool.map((entry) => Number(entry.candidate.score || 0)));
    const relevanceFloor = Math.max(0, bestBaseScore - 18);
    const relevantPool = semanticPool.filter(
      (entry) => Number(entry.candidate.score || 0) >= relevanceFloor
    );

    let available = relevantPool.filter((entry) => !entry.adjustment.blockedDuplicate);
    let forcedDuplicate = false;

    if (!available.length) {
      available = relevantPool;
      forcedDuplicate = true;
    }

    available.sort((left, right) => {
      if (right.adjustment.adjustedScore !== left.adjustment.adjustedScore) {
        return right.adjustment.adjustedScore - left.adjustment.adjustedScore;
      }
      return Number(right.candidate.score || 0) - Number(left.candidate.score || 0);
    });

    const winner = available[0];
    const candidate = winner.candidate;
    const adjustment = winner.adjustment;
    const series = String(report.series || '');

    const selection = {
      postPath: report.postPath,
      title: report.title,
      series,
      rank: candidate.rank,
      id: String(candidate.id || ''),
      baseScore: Number(candidate.score || 0),
      adjustedScore: Math.round(adjustment.adjustedScore),
      motif: adjustment.cluster,
      author: candidate.user || '',
      diversityPenalty: adjustment.clusterPenalty + adjustment.authorPenalty,
      clusterPenalty: adjustment.clusterPenalty,
      authorPenalty: adjustment.authorPenalty,
      sameSeriesReuse: adjustment.exactReuseInSeries,
      forcedDuplicate,
      semanticFallback,
      relevanceFloor,
      reasons: [
        adjustment.clusterPenalty
          ? `-${adjustment.clusterPenalty} motif diversity: ${adjustment.cluster} already used by ${adjustment.unrelatedCluster} unrelated article(s)`
          : '',
        adjustment.authorPenalty
          ? `-${adjustment.authorPenalty} photographer diversity: ${candidate.user} already used by ${adjustment.unrelatedAuthor} unrelated article(s)`
          : '',
        adjustment.exactReuseInSeries && forcedDuplicate
          ? 'same-series reuse: exact image only because no distinct relevant candidate remained'
          : '',
        forcedDuplicate
          ? 'forced duplicate: all semantically relevant alternatives were already used outside this series'
          : '',
        semanticFallback
          ? 'semantic fallback: no Top-5 candidate matched the article visual intent'
          : '',
        `relevance floor: ${relevanceFloor}/100`
      ].filter(Boolean)
    };

    selected.push(selection);

    const usage = { postPath: report.postPath, series };
    state.ids.set(selection.id, [...(state.ids.get(selection.id) || []), usage]);
    state.clusters.set(selection.motif, [...(state.clusters.get(selection.motif) || []), usage]);

    const authorKey = normalized(selection.author);
    if (authorKey) {
      state.authors.set(authorKey, [...(state.authors.get(authorKey) || []), usage]);
    }
  }

  return selected.sort((left, right) =>
    String(left.postPath || '').localeCompare(String(right.postPath || ''), 'en')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.reportsDir || !options.output || !options.selectionList) {
    throw new Error('--reports-dir, --output and --selection-list are required');
  }

  const reports = await loadReports(options.reportsDir);
  if (!reports.length) throw new Error('No cover candidate reports found');

  const selections = chooseDiverseCovers(reports);
  const manifest = {
    generatedAt: new Date().toISOString(),
    selections
  };

  await fs.writeFile(options.output, JSON.stringify(manifest, null, 2), 'utf8');
  await fs.writeFile(
    options.selectionList,
    selections
      .filter((selection) => !selection.skipped)
      .map((selection) => `${selection.postPath}|${selection.id}|${selection.baseScore}\n`)
      .join(''),
    'utf8'
  );

  for (const selection of selections) {
    if (selection.skipped) {
      console.log(`${selection.postPath}: skipped — ${selection.skipReason}`);
      continue;
    }
    console.log(
      `${selection.postPath}: rank ${selection.rank}, score ${selection.baseScore} -> ${selection.adjustedScore}, motif=${selection.motif}, series=${selection.series || '-'}`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  candidateAdjustment,
  chooseDiverseCovers,
  containsTerm,
  loadReports,
  motifCluster,
  parseArgs,
  reportPriority
};
