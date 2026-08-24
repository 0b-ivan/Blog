const { glossaryEntries } = require('./glossary');
const { searchableMarkdown } = require('../scripts/sync-glossary');

const COMMENT_MARKER = '<!-- kernel-notes-glossary-suggestions -->';

const DEFAULT_IGNORED_TERMS = new Set([
  'TODO', 'FIXME', 'NOTE', 'INFO', 'WARN', 'WARNING', 'ERROR', 'Kernel Notes'
]);

const CONTEXT_LEADERS = [
  'mit', 'via', 'über', 'durch',
  'nutzt', 'nutzen',
  'verwende', 'verwenden', 'verwendet',
  'installiere', 'installieren', 'installiert',
  'deploye', 'deployen', 'deployt',
  'betreibe', 'betreiben', 'betrieben'
];

const CONTEXT_STOP_WORDS = new Set([
  'aber', 'als', 'am', 'an', 'auch', 'auf', 'aus', 'bei', 'das', 'dem', 'den', 'der', 'die', 'diesem', 'dieser',
  'durch', 'ein', 'eine', 'einem', 'einer', 'eines', 'für', 'im', 'in', 'ist', 'lokalen', 'mehreren', 'mit', 'neuen',
  'oder', 'ohne', 'über', 'und', 'via', 'von', 'vor', 'wie', 'zu', 'zum', 'zur',
  'a', 'an', 'and', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with'
]);

const GENERIC_TECH_SUFFIXES = new Set([
  'Agent', 'Broker', 'Cache', 'Client', 'Cluster', 'Container', 'Controller', 'Dashboard', 'Database', 'Datenbank',
  'Framework', 'Gateway', 'Image', 'Index', 'Library', 'Modell', 'Model', 'Monitoring', 'Operator', 'Pipeline', 'Proxy',
  'Registry', 'Repository', 'Runtime', 'Server', 'Service', 'Storage', 'Tool', 'Workflow'
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTerm(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE');
}

function knownGlossaryLabels(entries = glossaryEntries) {
  return [...new Set(entries.flatMap((entry) => [entry.key, ...(entry.aliases || [])]).filter(Boolean))];
}

function knownGlossarySet(entries = glossaryEntries) {
  return new Set(knownGlossaryLabels(entries).map(normalizeTerm));
}

function maskKnownGlossaryLabels(markdown, entries = glossaryEntries) {
  let text = searchableMarkdown(markdown);
  const labels = knownGlossaryLabels(entries).sort((left, right) => right.length - left.length);

  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
    text = text.replace(pattern, (_match, prefix, matchedLabel) => `${prefix}${' '.repeat(matchedLabel.length)}`);
  }

  return text;
}

function frontmatterLineOffset(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  return match ? (match[0].match(/\n/g) || []).length : 0;
}

function confidenceRank(value) {
  return value === 'high' ? 2 : 1;
}

function classifyToken(token) {
  const value = String(token || '').trim();
  if (value.length < 2 || value.length > 64) {
    return null;
  }

  const letters = value.match(/\p{L}/gu) || [];
  const upper = value.match(/\p{Lu}/gu) || [];
  const lower = value.match(/\p{Ll}/gu) || [];
  if (letters.length < 2) {
    return null;
  }

  const acronym = /^(?:[\p{Lu}\d]+(?:[./_+-][\p{Lu}\d]+)*)$/u.test(value)
    && upper.length >= 2
    && lower.length === 0;
  if (acronym) {
    return { confidence: 'high', reason: 'Akronym oder technische Großschreibung' };
  }

  const uppercaseAfterFirst = [...value].slice(1).some((character) => /\p{Lu}/u.test(character));
  if (upper.length > 0 && lower.length > 0 && uppercaseAfterFirst) {
    return { confidence: 'high', reason: 'Gemischte Groß-/Kleinschreibung wie bei Produkt- oder Projektnamen' };
  }

  const technicalSeparator = /[.+#/_-]/u.test(value)
    && (/[\d]/u.test(value) || uppercaseAfterFirst || /(?:api|cli|db|http|js|rag|sdk|sql|ssh|tls|ui)$/iu.test(value));
  if (technicalSeparator) {
    return { confidence: 'high', reason: 'Technischer zusammengesetzter Begriff' };
  }

  return null;
}

function contextualCandidates(line) {
  const candidates = [];

  for (const leader of CONTEXT_LEADERS) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(leader)}\\s+([\\p{L}\\p{N}.+#/_-]+(?:\\s+[\\p{Lu}][\\p{L}\\p{N}.+#/_-]+){0,3})`,
      'gu'
    );

    for (const match of line.matchAll(pattern)) {
      const phrase = String(match[2] || '').trim();
      if (!phrase) {
        continue;
      }

      const parts = phrase.split(/\s+/).filter(Boolean);
      if (!parts.length || CONTEXT_STOP_WORDS.has(normalizeTerm(parts[0]))) {
        continue;
      }

      let term = phrase;
      if (parts.length > 1 && GENERIC_TECH_SUFFIXES.has(parts[parts.length - 1])) {
        term = parts[0];
      }

      if (term.length >= 3 && term.length <= 80) {
        candidates.push({
          term,
          confidence: 'medium',
          reason: 'Unbekannter Begriff in technischem Verwendungskontext'
        });
      }
    }
  }

  return candidates;
}

function contextSnippet(line, maxLength = 150) {
  const value = String(line || '').replace(/\s+/g, ' ').trim();
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function addSuggestion(target, candidate, location, known, ignored) {
  const term = String(candidate.term || '')
    .trim()
    .replace(/^[.,;:!?()[\]{}"']+|[.,;:!?()[\]{}"']+$/g, '');
  const key = normalizeTerm(term);
  if (!key || known.has(key) || ignored.has(key) || CONTEXT_STOP_WORDS.has(key)) {
    return;
  }

  let entry = target.get(key);
  if (!entry) {
    entry = {
      term,
      confidence: candidate.confidence,
      reasons: new Set(),
      occurrences: [],
      occurrenceKeys: new Set()
    };
    target.set(key, entry);
  }

  if (confidenceRank(candidate.confidence) > confidenceRank(entry.confidence)) {
    entry.confidence = candidate.confidence;
    entry.term = term;
  }
  entry.reasons.add(candidate.reason);

  const occurrenceKey = `${location.file}:${location.line}`;
  if (!entry.occurrenceKeys.has(occurrenceKey)) {
    entry.occurrenceKeys.add(occurrenceKey);
    entry.occurrences.push(location);
  }
}

function sortSuggestions(entries) {
  return entries.sort((left, right) => {
    const confidenceDelta = confidenceRank(right.confidence) - confidenceRank(left.confidence);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    const occurrenceDelta = right.occurrences.length - left.occurrences.length;
    if (occurrenceDelta !== 0) {
      return occurrenceDelta;
    }
    return left.term.localeCompare(right.term, 'de', { sensitivity: 'base' });
  });
}

function publicSuggestions(target) {
  return sortSuggestions([...target.values()].map((entry) => ({
    term: entry.term,
    confidence: entry.confidence,
    reasons: [...entry.reasons],
    occurrences: entry.occurrences
  })));
}

function suggestGlossaryTerms(markdown, options = {}) {
  const entries = options.entries || glossaryEntries;
  const known = knownGlossarySet(entries);
  const ignored = new Set([
    ...[...DEFAULT_IGNORED_TERMS].map(normalizeTerm),
    ...(options.ignoredTerms || []).map(normalizeTerm)
  ]);
  const file = options.file || 'article.md';
  const text = maskKnownGlossaryLabels(markdown, entries);
  const lineOffset = frontmatterLineOffset(markdown);
  const suggestions = new Map();
  const tokenPattern = /[\p{L}\p{N}][\p{L}\p{N}.+#/_-]{1,63}/gu;

  text.split('\n').forEach((line, index) => {
    const location = {
      file,
      line: index + 1 + lineOffset,
      context: contextSnippet(line)
    };

    for (const match of line.matchAll(tokenPattern)) {
      const classification = classifyToken(match[0]);
      if (classification) {
        addSuggestion(suggestions, { term: match[0], ...classification }, location, known, ignored);
      }
    }

    for (const candidate of contextualCandidates(line)) {
      addSuggestion(suggestions, candidate, location, known, ignored);
    }
  });

  return publicSuggestions(suggestions);
}

function mergeSuggestions(groups) {
  const merged = new Map();
  const emptySet = new Set();

  for (const suggestions of groups) {
    for (const suggestion of suggestions) {
      for (const occurrence of suggestion.occurrences || []) {
        addSuggestion(
          merged,
          {
            term: suggestion.term,
            confidence: suggestion.confidence,
            reason: (suggestion.reasons || []).join('; ')
          },
          occurrence,
          emptySet,
          emptySet
        );
      }
    }
  }

  return publicSuggestions(merged);
}

function markdownCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdownReport(suggestions, options = {}) {
  const scannedFiles = Number(options.scannedFiles || 0);
  const lines = [
    COMMENT_MARKER,
    '## Glossar-Vorschläge',
    '',
    `Geprüfte Artikel: **${scannedFiles}**. Die Erkennung ist heuristisch und **nicht blockierend**; es wird nichts automatisch ins Glossar geschrieben.`,
    ''
  ];

  if (!suggestions.length) {
    lines.push('✅ Keine neuen Fachbegriffe mit hoher oder mittlerer Konfidenz erkannt.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Begriff | Konfidenz | Vorkommen | Erste Fundstelle | Warum |');
  lines.push('| --- | --- | ---: | --- | --- |');

  for (const suggestion of suggestions) {
    const first = suggestion.occurrences[0] || { file: '', line: '' };
    lines.push(`| \`${markdownCell(suggestion.term)}\` | ${suggestion.confidence === 'high' ? 'hoch' : 'mittel'} | ${suggestion.occurrences.length} | ${markdownCell(first.file)}:${first.line} | ${markdownCell((suggestion.reasons || []).join('; '))} |`);
  }

  lines.push('');
  lines.push('Wenn ein Begriff wirklich ins Glossar gehört, ergänze ihn in `config/glossary.json` oder `config/glossary/*.json`. Dauerhaft abgelehnte Vorschläge können in `config/glossary-suggestion-ignore.json` eingetragen werden.');
  return `${lines.join('\n')}\n`;
}

function renderTextReport(suggestions, options = {}) {
  const scannedFiles = Number(options.scannedFiles || 0);
  const lines = [`Glossar-Vorschläge (${scannedFiles} Artikel geprüft)`];
  if (!suggestions.length) {
    lines.push('Keine neuen Fachbegriffe erkannt.');
    return `${lines.join('\n')}\n`;
  }

  for (const suggestion of suggestions) {
    const first = suggestion.occurrences[0] || { file: '', line: '' };
    lines.push(`- ${suggestion.term} [${suggestion.confidence}] ${suggestion.occurrences.length}x (${first.file}:${first.line})`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  COMMENT_MARKER,
  classifyToken,
  contextualCandidates,
  knownGlossaryLabels,
  maskKnownGlossaryLabels,
  mergeSuggestions,
  normalizeTerm,
  renderMarkdownReport,
  renderTextReport,
  suggestGlossaryTerms
};
