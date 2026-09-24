const {
  candidateAdjustment,
  chooseDiverseCovers,
  containsTerm,
  motifCluster
} = require('../scripts/select-diverse-cover-candidates');

function candidate(rank, id, score, tags, user = 'photographer') {
  return { rank, id: String(id), score, tags, user };
}

describe('series-aware cover diversity', () => {
  it('matches motif terms as whole words instead of substrings', () => {
    expect(containsTerm('feedback, development, software', 'feed')).toBe(false);
    expect(motifCluster('feedback, development, software')).not.toBe('feed-news');
    expect(motifCluster('rss, feed, reader')).toBe('feed-news');
  });

  it('classifies common infrastructure motifs', () => {
    expect(motifCluster('server, rack, datacenter, infrastructure')).toBe('server-infra');
    expect(motifCluster('network, router, ethernet, cable')).toBe('network');
    expect(motifCluster('security, firewall, padlock')).toBe('security');
  });

  it('blocks the same Pixabay image across unrelated articles', () => {
    const reports = [
      {
        postPath: 'posts/a.md',
        title: 'Article A',
        series: '',
        candidates: [
          candidate(1, 10, 90, 'server, rack, datacenter'),
          candidate(2, 11, 80, 'network, router, ethernet')
        ]
      },
      {
        postPath: 'posts/b.md',
        title: 'Article B',
        series: '',
        candidates: [
          candidate(1, 10, 95, 'server, rack, datacenter'),
          candidate(2, 12, 82, 'security, firewall, padlock')
        ]
      }
    ];

    const selections = chooseDiverseCovers(reports);
    const ids = selections.map((selection) => selection.id);

    expect(new Set(ids).size).toBe(2);
    expect(ids.filter((id) => id === '10')).toHaveLength(1);
    expect(ids.some((id) => id !== '10')).toBe(true);
  });

  it('allows exact image reuse inside the same series', () => {
    const reports = [
      {
        postPath: 'posts/part-1.md',
        title: 'K3s auf Proxmox – Teil I',
        series: 'k3s-auf-proxmox',
        candidates: [
          candidate(1, 42, 88, 'server, rack, datacenter'),
          candidate(2, 43, 70, 'network, cable')
        ]
      },
      {
        postPath: 'posts/part-2.md',
        title: 'K3s auf Proxmox – Teil II',
        series: 'k3s-auf-proxmox',
        candidates: [
          candidate(1, 42, 86, 'server, rack, datacenter'),
          candidate(2, 44, 72, 'cloud, hosting')
        ]
      }
    ];

    const selections = chooseDiverseCovers(reports);
    expect(selections.map((selection) => selection.id)).toEqual(['42', '42']);
    expect(selections[1].sameSeriesReuse).toBe(true);
  });

  it('penalizes repeated motifs outside a series even when image ids differ', () => {
    const reports = [
      {
        postPath: 'posts/a.md',
        title: 'Server article',
        series: '',
        candidates: [
          candidate(1, 1, 90, 'server, rack, datacenter'),
          candidate(2, 2, 65, 'network, router')
        ]
      },
      {
        postPath: 'posts/b.md',
        title: 'Another server article',
        series: '',
        candidates: [
          candidate(1, 3, 88, 'server, rack, infrastructure', 'server-author'),
          candidate(2, 4, 82, 'security, firewall, padlock', 'security-author')
        ]
      }
    ];

    const selections = chooseDiverseCovers(reports);
    const second = selections.find((selection) => selection.postPath === 'posts/b.md');

    expect(second.id).toBe('4');
    expect(second.motif).toBe('security');
    expect(second.diversityPenalty).toBe(0);
  });

  it('keeps diversity inside a topical relevance window', () => {
    const reports = [
      {
        postPath: 'posts/first.md',
        title: 'First article',
        series: '',
        candidates: [
          { ...candidate(1, 50, 92, 'server, rack, datacenter'), semanticMismatch: false }
        ]
      },
      {
        postPath: 'posts/second.md',
        title: 'Second article',
        series: '',
        candidates: [
          { ...candidate(1, 50, 90, 'server, rack, datacenter'), semanticMismatch: false },
          { ...candidate(2, 51, 58, 'security, firewall, padlock'), semanticMismatch: false },
          { ...candidate(3, 52, 95, 'office, meeting, business'), semanticMismatch: true }
        ]
      }
    ];

    const selections = chooseDiverseCovers(reports);
    const second = selections.find((selection) => selection.postPath === 'posts/second.md');

    expect(second.id).toBe('50');
    expect(second.forcedDuplicate).toBe(true);
    expect(second.relevanceFloor).toBe(72);
  });

  it('does not choose a semantic mismatch merely to gain diversity', () => {
    const reports = [
      {
        postPath: 'posts/article.md',
        title: 'Writing pipeline',
        series: '',
        candidates: [
          { ...candidate(1, 1, 82, 'writing, keyboard, document'), semanticMismatch: false },
          { ...candidate(2, 2, 99, 'secretary, office, automation'), semanticMismatch: true }
        ]
      }
    ];

    const [selection] = chooseDiverseCovers(reports);
    expect(selection.id).toBe('1');
    expect(selection.semanticFallback).toBe(false);
  });

  it('records motif and photographer penalties deterministically', () => {
    const state = {
      ids: new Map(),
      clusters: new Map([
        ['server-infra', [{ postPath: 'posts/used.md', series: '' }]]
      ]),
      authors: new Map([
        ['same-author', [{ postPath: 'posts/used.md', series: '' }]]
      ])
    };

    const result = candidateAdjustment(
      candidate(1, 99, 80, 'server, rack, datacenter', 'Same-Author'),
      { postPath: 'posts/new.md', series: '' },
      state
    );

    expect(result.clusterPenalty).toBe(12);
    expect(result.authorPenalty).toBe(4);
    expect(result.adjustedScore).toBe(64);
  });
});
