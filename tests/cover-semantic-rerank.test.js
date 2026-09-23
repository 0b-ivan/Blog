const {
  articleSemanticText,
  blendCoverScore,
  blendScore,
  candidateSemanticText,
  combinedSemanticScore,
  conceptPrototype,
  heroQuality,
  prototypeMarginScore,
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

  it('uses positive and negative concept prototypes to reject adjacent RSS concepts', async () => {
    const report = {
      postPath: 'posts/rss.md',
      title: 'RSS ist nicht tot',
      visualIntent: 'rss-reader',
      candidates: [
        {
          rank: 1,
          id: 'press',
          score: 95,
          tags: 'press, journalist, photographer, news, newspaper, reporter',
          reasons: ['old semantic neighbor']
        },
        {
          rank: 2,
          id: 'feed',
          score: 50,
          tags: 'rss, feed, reader, subscription, aggregator, website',
          reasons: ['actual feed concept']
        }
      ]
    };

    const embedder = {
      embedQuery: async (text) => {
        if (text.includes('journalist press photographer')) return [1, 0];
        if (text.includes('RSS feed reader')) return [0, 1];
        return [0.8, 0.6];
      },
      embedDocuments: async (texts) => texts.map((text) =>
        text.includes('journalist')
          ? [0.9, 0.43589]
          : [0.5, 0.86603]
      )
    };

    const reranked = await rerankReport(
      report,
      'FreshRSS web feed reader subscriptions and feed aggregation',
      embedder,
      {
        embeddingModel: 'Xenova/multilingual-e5-small',
        semanticWeight: 0.9,
        mismatchDelta: 0.07
      }
    );

    expect(conceptPrototype(report).key).toBe('rss-reader');
    expect(reranked.semanticPrototype).toBe('rss-reader');
    expect(reranked.candidates[0].id).toBe('feed');
    expect(reranked.candidates[0].prototypeMargin).toBeGreaterThan(0);
    expect(reranked.candidates[0].prototypeMismatch).toBe(false);

    const press = reranked.candidates.find((candidate) => candidate.id === 'press');
    expect(press.prototypeMargin).toBeLessThan(0);
    expect(press.prototypeMismatch).toBe(true);
    expect(press.semanticMismatch).toBe(true);
  });

  it('maps concept margin into a strong text-semantic preference', () => {
    expect(prototypeMarginScore(0.1)).toBe(100);
    expect(prototypeMarginScore(0)).toBe(50);
    expect(prototypeMarginScore(-0.1)).toBe(0);
    expect(combinedSemanticScore(100, 0, true)).toBe(65);
    expect(combinedSemanticScore(60, 100, true)).toBe(74);
    expect(combinedSemanticScore(77, null, false)).toBe(77);
  });

  it('penalizes generic icons and terminal screenshots as weak hero covers', () => {
    const rssPrototype = conceptPrototype({ visualIntent: 'rss-reader' });
    const rssLogo = heroQuality({
      tags: 'rss, feed, icon, logo, symbol, isolated'
    }, rssPrototype);
    const rssDashboard = heroQuality({
      tags: 'rss, feed, reader, dashboard, browser, website'
    }, rssPrototype);

    expect(rssDashboard.score).toBeGreaterThan(rssLogo.score);
    expect(rssLogo.avoided).toContain('icon');

    const systemdPrototype = conceptPrototype({ visualIntent: 'systemd-service' });
    const emptyTerminal = heroQuality({
      tags: 'linux, window, terminal, cmd, console, scroll, minimize'
    }, systemdPrototype);
    const operations = heroQuality({
      tags: 'linux, server, service, monitoring, logs, daemon, administration'
    }, systemdPrototype);

    expect(operations.score).toBeGreaterThan(emptyTerminal.score);
    expect(emptyTerminal.screenMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('makes a monkey motif outrank a generic red error symbol for Chaos Monkey', () => {
    const prototype = conceptPrototype({ visualIntent: 'chaos-monkey' });
    const monkey = heroQuality({
      tags: 'monkey, ape, primate, chimpanzee'
    }, prototype);
    const error = heroQuality({
      tags: 'false, error, red, cross, icon, symbol, sign'
    }, prototype);

    expect(monkey.score).toBeGreaterThan(error.score);
    expect(monkey.preferred.length).toBeGreaterThan(0);
    expect(error.avoided.length).toBeGreaterThan(0);
  });

  it('blends semantic relevance with hero quality before heuristics', () => {
    expect(blendCoverScore(90, 100, 20, 0.8)).toBe(88);
    expect(blendCoverScore(90, 20, 100, 0.8)).toBe(80);
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
