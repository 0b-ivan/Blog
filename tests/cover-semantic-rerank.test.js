const {
  articleSemanticText,
  blendScore,
  candidateSemanticText,
  rerankReport,
  semanticRelativeScore
} = require('../scripts/rerank-cover-candidates-e5');

describe('E5 cover semantic reranking', () => {
  it('builds article semantics from title, metadata and prose instead of only tags', () => {
    const raw = `---
title: systemd Services sauber betreiben
category: Linux
tags:
  - systemd
  - Operations
excerpt: Services mit systemd und journalctl zuverlässig betreiben.
search_queries:
  - query: systemd Service Logs prüfen
---

Ich zeige, wie ein Linux-Dienst gestartet, überwacht und mit journalctl analysiert wird.

\`\`\`bash
systemctl status example
\`\`\`
`;

    const text = articleSemanticText(raw, {});
    expect(text).toContain('Titel: systemd Services sauber betreiben');
    expect(text).toContain('Kategorie: Linux');
    expect(text).toContain('Tags: systemd, Operations');
    expect(text).toContain('systemd Service Logs prüfen');
    expect(text).toContain('Linux-Dienst gestartet');
    expect(text).not.toContain('systemctl status example');
  });

  it('uses Pixabay tags as the candidate text representation', () => {
    expect(candidateSemanticText({
      tags: 'linux, shell, daemon, logs'
    })).toContain('linux, shell, daemon, logs');
  });

  it('lets E5 semantics override a strong but textually wrong heuristic candidate', async () => {
    const report = {
      postPath: 'posts/systemd.md',
      title: 'systemd Services sauber betreiben',
      candidates: [
        {
          rank: 1,
          id: 'train',
          score: 95,
          tags: 'train, station, terminal, transport',
          reasons: ['heuristic favorite']
        },
        {
          rank: 2,
          id: 'linux',
          score: 40,
          tags: 'linux, shell, daemon, service, logs',
          reasons: ['lower heuristic score']
        }
      ]
    };

    const embedder = {
      embedQuery: async () => [1, 0],
      embedDocuments: async (texts) => texts.map((text) =>
        text.includes('linux') ? [1, 0] : [0, 1]
      )
    };

    const reranked = await rerankReport(
      report,
      'Linux systemd service logs daemon journalctl',
      embedder,
      {
        embeddingModel: 'Xenova/multilingual-e5-small',
        semanticWeight: 0.82,
        mismatchDelta: 0.07
      }
    );

    expect(reranked.semanticModel).toBe('Xenova/multilingual-e5-small');
    expect(reranked.candidates[0].id).toBe('linux');
    expect(reranked.candidates[0].heuristicScore).toBe(40);
    expect(reranked.candidates[0].semanticSimilarity).toBe(1);
    expect(reranked.candidates[0].semanticMismatch).toBe(false);

    const train = reranked.candidates.find((candidate) => candidate.id === 'train');
    expect(train.heuristicScore).toBe(95);
    expect(train.semanticMismatch).toBe(true);
    expect(reranked.candidates[0].score).toBeGreaterThan(train.score);
  });

  it('normalizes semantic relevance relative to the best candidate', () => {
    expect(semanticRelativeScore(0.88, 0.88, 0.07)).toBe(100);
    expect(semanticRelativeScore(0.81, 0.88, 0.07)).toBe(65);
    expect(semanticRelativeScore(0.74, 0.88, 0.07)).toBe(30);
  });

  it('keeps semantic similarity as the dominant score', () => {
    expect(blendScore(100, 20, 0.82)).toBe(86);
    expect(blendScore(60, 100, 0.82)).toBe(67);
  });
});
