(() => {
  const FORCE_GRAPH_SRC = '/vendor/force-graph/force-graph.min.js';
  const SEMANTIC_NEIGHBORS = 5;
  const SEMANTIC_CONCURRENCY = 3;
  const COLORS = {
    article: '#5b9cf6',
    tag: '#ef6a6a',
    category: '#9b83f3'
  };

  function normalizeTags(tags) {
    return Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
  }

  function normalized(value) {
    return String(value || '').trim().toLocaleLowerCase('de');
  }

  function semanticQuery(post) {
    return [
      post?.title,
      post?.category,
      normalizeTags(post?.tags).join(' '),
      post?.excerpt
    ]
      .filter(Boolean)
      .join(' · ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
  }

  function semanticEdgeKey(leftSlug, rightSlug) {
    return [String(leftSlug), String(rightSlug)].sort().join('::');
  }

  function mergeSemanticResults(posts, resultsBySlug) {
    const known = new Set((Array.isArray(posts) ? posts : []).map((post) => post.slug));
    const edges = new Map();

    for (const [sourceSlug, results] of Object.entries(resultsBySlug || {})) {
      if (!known.has(sourceSlug)) {
        continue;
      }

      for (const result of Array.isArray(results) ? results : []) {
        if (!result?.slug || result.slug === sourceSlug || !known.has(result.slug)) {
          continue;
        }

        const score = Number(result.score) || 0;
        if (score <= 0) {
          continue;
        }

        const key = semanticEdgeKey(sourceSlug, result.slug);
        const existing = edges.get(key);
        if (!existing || score > existing.score) {
          const [source, target] = [sourceSlug, result.slug].sort();
          edges.set(key, { source, target, score });
        }
      }
    }

    return [...edges.values()].sort((left, right) => right.score - left.score);
  }

  function buildGraphData(posts, semanticEdges) {
    const safePosts = Array.isArray(posts) ? posts : [];
    const nodes = [];
    const links = [];
    const ids = new Set();
    const tagFrequency = new Map();

    safePosts.forEach((post) => {
      normalizeTags(post.tags).forEach((tag) => {
        const key = normalized(tag);
        const entry = tagFrequency.get(key) || { label: tag, count: 0 };
        entry.count += 1;
        tagFrequency.set(key, entry);
      });
    });

    function addNode(node) {
      if (!node?.id || ids.has(node.id)) {
        return;
      }
      ids.add(node.id);
      nodes.push(node);
    }

    safePosts.forEach((post) => {
      const postId = `post:${post.slug}`;
      addNode({
        id: postId,
        label: post.title || post.slug,
        type: 'article',
        href: `/posts/${post.slug}`,
        color: COLORS.article,
        category: post.category || '',
        tags: normalizeTags(post.tags)
      });

      const categoryLabel = String(post.category || 'IT').trim() || 'IT';
      const categoryId = `category:${normalized(categoryLabel)}`;
      addNode({
        id: categoryId,
        label: categoryLabel,
        type: 'category',
        href: '/#topics',
        color: COLORS.category
      });
      links.push({ source: postId, target: categoryId, type: 'category' });

      normalizeTags(post.tags).forEach((tag) => {
        const key = normalized(tag);
        if ((tagFrequency.get(key)?.count || 0) < 2) {
          return;
        }
        const tagId = `tag:${key}`;
        addNode({
          id: tagId,
          label: tag,
          type: 'tag',
          href: `/tags/${encodeURIComponent(tag)}`,
          color: COLORS.tag
        });
        links.push({ source: postId, target: tagId, type: 'tag' });
      });
    });

    for (const edge of Array.isArray(semanticEdges) ? semanticEdges : []) {
      const source = `post:${edge.source}`;
      const target = `post:${edge.target}`;
      if (!ids.has(source) || !ids.has(target)) {
        continue;
      }
      links.push({
        source,
        target,
        type: 'semantic',
        score: Number(edge.score) || 0
      });
    }

    const degree = new Map();
    links.forEach((link) => {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    });

    nodes.forEach((node) => {
      const connections = degree.get(node.id) || 0;
      if (node.type === 'article') {
        node.val = Math.min(11, 4.6 + (connections * 0.65));
      } else if (node.type === 'category') {
        node.val = Math.min(9, 2.7 + (connections * 1.05));
      } else {
        node.val = Math.min(8, 2.1 + (connections * 0.85));
      }
    });

    return { nodes, links };
  }

  async function mapWithConcurrency(items, concurrency, worker) {
    const safeItems = Array.isArray(items) ? items : [];
    const output = new Array(safeItems.length);
    let cursor = 0;

    async function run() {
      while (cursor < safeItems.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(safeItems[index], index);
      }
    }

    const workers = Array.from(
      { length: Math.min(Math.max(1, concurrency), Math.max(1, safeItems.length)) },
      () => run()
    );
    await Promise.all(workers);
    return output;
  }

  function ensureStyles() {
    if (document.querySelector('link[data-knowledge-network-style]')) {
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/knowledge-network.css';
    link.dataset.knowledgeNetworkStyle = 'true';
    document.head.append(link);
  }

  function loadForceGraph() {
    if (typeof window.ForceGraph === 'function') {
      return Promise.resolve(window.ForceGraph);
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-global-force-graph]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.ForceGraph), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = FORCE_GRAPH_SRC;
      script.async = true;
      script.dataset.globalForceGraph = 'true';
      script.addEventListener('load', () => {
        if (typeof window.ForceGraph === 'function') {
          resolve(window.ForceGraph);
          return;
        }
        reject(new Error('ForceGraph ist nach dem Laden nicht verfügbar.'));
      });
      script.addEventListener('error', () => reject(new Error('ForceGraph konnte nicht geladen werden.')));
      document.head.append(script);
    });
  }

  function rewriteHomeNavigation() {
    const logo = document.querySelector('.site-header .logo');
    if (logo) {
      logo.href = '/';
    }
    document.querySelectorAll('.main-nav a').forEach((link) => {
      const href = link.getAttribute('href');
      if (href === '#posts') link.href = '/#posts';
      if (href === '#topics') link.href = '/#topics';
    });
  }

  function renderShell() {
    document.title = 'Wissensnetz | Kernel Notes';
    document.body.classList.add('knowledge-network-page');
    rewriteHomeNavigation();

    const main = document.querySelector('main');
    if (!main) {
      throw new Error('Main-Container fehlt.');
    }

    main.innerHTML = `
      <section class="knowledge-network" aria-labelledby="knowledge-network-title">
        <header class="knowledge-network__hero">
          <div>
            <p class="eyebrow">RAG · VECTOR DB · WISSENSNETZ</p>
            <h1 id="knowledge-network-title">Das Wissen hinter Kernel Notes</h1>
            <p>Artikel werden semantisch über Kernel Grep verbunden. Wiederkehrende Tags und Kategorien machen sichtbar, warum Themen zusammengehören.</p>
          </div>
          <div class="knowledge-network__stats" aria-live="polite">
            <span><strong data-stat="articles">–</strong> Artikel</span>
            <span><strong data-stat="semantic">–</strong> semantische Kanten</span>
            <span><strong data-stat="topics">–</strong> Themenknoten</span>
          </div>
        </header>

        <div class="knowledge-network__toolbar">
          <label>
            <span>Netz durchsuchen</span>
            <input type="search" data-knowledge-filter placeholder="z. B. Docker, AWS, RSS …" autocomplete="off" />
          </label>
          <button type="button" data-knowledge-fit>Alles anzeigen</button>
          <div class="knowledge-network__legend" aria-label="Legende">
            <span><i style="--node-color:${COLORS.article}"></i>Artikel</span>
            <span><i style="--node-color:${COLORS.tag}"></i>Tag</span>
            <span><i style="--node-color:${COLORS.category}"></i>Kategorie</span>
          </div>
        </div>

        <div class="knowledge-network__frame">
          <div class="knowledge-network__chrome" aria-hidden="true">
            <span class="is-red"></span><span class="is-yellow"></span><span class="is-green"></span>
            <code>knowledge://kernel-notes/global</code>
          </div>
          <div class="knowledge-network__canvas" data-knowledge-canvas>
            <p class="knowledge-network__status" data-knowledge-status>Artikel und semantische Beziehungen werden geladen…</p>
          </div>
        </div>
        <p class="knowledge-network__note">Semantische Kanten stammen aus derselben lokalen Suche wie Kernel Grep. Die Anfragen werden gedrosselt, damit das Embedding-Modell nicht unnötig parallel belastet wird.</p>
      </section>`;

    return main.querySelector('.knowledge-network');
  }

  async function loadSemanticEdges(posts, status) {
    const resultsBySlug = {};
    let completed = 0;

    await mapWithConcurrency(posts, SEMANTIC_CONCURRENCY, async (post) => {
      const query = semanticQuery(post);
      if (query.length < 2) {
        resultsBySlug[post.slug] = [];
        return;
      }

      try {
        const params = new URLSearchParams({
          q: query,
          limit: String(SEMANTIC_NEIGHBORS + 1)
        });
        const response = await fetch(`/api/search?${params.toString()}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        resultsBySlug[post.slug] = Array.isArray(payload.results) ? payload.results : [];
      } catch (error) {
        console.warn(`Knowledge relation failed for ${post.slug}:`, error.message || error);
        resultsBySlug[post.slug] = [];
      } finally {
        completed += 1;
        if (status) {
          status.textContent = `Semantische Beziehungen: ${completed}/${posts.length} Artikel analysiert…`;
        }
      }
    });

    return mergeSemanticResults(posts, resultsBySlug);
  }

  function connectedTo(link, node) {
    if (!node) return false;
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    return source === node.id || target === node.id;
  }

  function drawNodeLabel(node, ctx, globalScale) {
    const fontSize = 11 / globalScale;
    const radius = Math.sqrt(Number(node.val) || 1) * 2.2;
    const maxLength = node.type === 'article' ? 34 : 22;
    const label = node.label.length > maxLength ? `${node.label.slice(0, maxLength - 1)}…` : node.label;
    ctx.font = `500 ${fontSize}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#30353b';
    ctx.fillText(label, node.x + radius + (4 / globalScale), node.y);
  }

  function renderGraph(section, graphData) {
    const canvas = section.querySelector('[data-knowledge-canvas]');
    const filter = section.querySelector('[data-knowledge-filter]');
    const fitButton = section.querySelector('[data-knowledge-fit]');
    let hoveredNode = null;
    let filterValue = '';

    canvas.innerHTML = '';
    const height = Math.max(520, Math.min(760, window.innerHeight - 230));
    const graph = window.ForceGraph()(canvas)
      .graphData(graphData)
      .width(Math.max(320, canvas.clientWidth))
      .height(height)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeId('id')
      .nodeVal('val')
      .nodeRelSize(2.3)
      .nodeColor((node) => {
        const matches = !filterValue || normalized(node.label).includes(filterValue);
        return matches ? node.color : 'rgba(112, 120, 128, 0.18)';
      })
      .nodeLabel((node) => {
        if (node.type === 'article') {
          return `Artikel: ${node.label}${node.category ? ` · ${node.category}` : ''}`;
        }
        return `${node.type === 'tag' ? 'Tag' : 'Kategorie'}: ${node.label}`;
      })
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject((node, ctx, globalScale) => {
        const matches = !filterValue || normalized(node.label).includes(filterValue);
        if (matches) drawNodeLabel(node, ctx, globalScale);
      })
      .linkColor((link) => {
        if (hoveredNode) {
          return connectedTo(link, hoveredNode) ? 'rgba(0, 71, 62, 0.75)' : 'rgba(42, 48, 54, 0.05)';
        }
        if (link.type === 'semantic') return 'rgba(91, 156, 246, 0.38)';
        return 'rgba(42, 48, 54, 0.14)';
      })
      .linkWidth((link) => {
        if (hoveredNode && connectedTo(link, hoveredNode)) return 2.5;
        if (link.type === 'semantic') return Math.min(2.8, 0.9 + ((Number(link.score) || 0) * 1.8));
        return 0.8;
      })
      .onNodeHover((node) => {
        hoveredNode = node || null;
        canvas.style.cursor = node?.href ? 'pointer' : 'grab';
        graph.linkColor(graph.linkColor());
        graph.linkWidth(graph.linkWidth());
      })
      .onNodeClick((node) => {
        if (node?.href) window.location.href = node.href;
      })
      .onEngineStop(() => graph.zoomToFit(500, 48));

    graph.d3Force('charge')?.strength?.(-145);
    graph.d3Force('link')?.distance?.((link) => link.type === 'semantic' ? 118 : 78);

    filter?.addEventListener('input', () => {
      filterValue = normalized(filter.value);
      graph.nodeColor(graph.nodeColor());
      graph.nodeCanvasObject(graph.nodeCanvasObject());
    });
    fitButton?.addEventListener('click', () => graph.zoomToFit(450, 48));
    window.addEventListener('resize', () => graph.width(Math.max(320, canvas.clientWidth)));
  }

  async function initialize() {
    if (window.location.pathname !== '/knowledge') {
      return;
    }

    ensureStyles();
    const section = renderShell();
    const status = section.querySelector('[data-knowledge-status]');

    try {
      const [postsResponse] = await Promise.all([
        fetch('/api/posts', { headers: { Accept: 'application/json' } }),
        loadForceGraph()
      ]);
      if (!postsResponse.ok) {
        throw new Error(`Artikel konnten nicht geladen werden (${postsResponse.status}).`);
      }

      const posts = await postsResponse.json();
      if (!Array.isArray(posts) || posts.length === 0) {
        throw new Error('Keine Artikel für das Wissensnetz vorhanden.');
      }

      const semanticEdges = await loadSemanticEdges(posts, status);
      const graphData = buildGraphData(posts, semanticEdges);
      section.querySelector('[data-stat="articles"]').textContent = String(posts.length);
      section.querySelector('[data-stat="semantic"]').textContent = String(semanticEdges.length);
      section.querySelector('[data-stat="topics"]').textContent = String(
        graphData.nodes.filter((node) => node.type !== 'article').length
      );
      section.dataset.knowledgeReady = 'true';
      renderGraph(section, graphData);
    } catch (error) {
      if (status) {
        status.textContent = `Wissensnetz konnte nicht geladen werden: ${error.message}`;
        status.classList.add('is-error');
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildGraphData,
      mapWithConcurrency,
      mergeSemanticResults,
      semanticEdgeKey,
      semanticQuery
    };
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initialize();
  }
})();
