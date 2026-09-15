(() => {
  const FORCE_GRAPH_SRC = '/vendor/force-graph/force-graph.min.js';
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
        href: post.url || `/posts/${post.slug}`,
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
        score: Number(edge.relationScore) || Number(edge.similarity) || 0,
        similarity: Number(edge.similarity) || 0,
        semanticLift: Number(edge.semanticLift) || 0,
        sharedTags: normalizeTags(edge.sharedTags),
        sameCategory: Boolean(edge.sameCategory)
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
            <p>Die Artikel-Vektoren kommen direkt aus DuckDB. Semantische Kanten verbinden ähnliche Beiträge; Tags und Kategorien zeigen die fachlichen Überschneidungen.</p>
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
            <p class="knowledge-network__status" data-knowledge-status>Artikel-Vektoren und Beziehungen werden aus DuckDB geladen…</p>
          </div>
        </div>
        <p class="knowledge-network__note">Beim Öffnen dieser Seite werden keine neuen Embeddings berechnet. Das Netz wird aus den bereits indexierten Artikel-Vektoren aufgebaut; Roh-Vektoren verlassen den RAG-Service nicht.</p>

        <section class="blog-statistics" aria-labelledby="blog-statistics-title" data-blog-statistics>
          <div class="blog-statistics__heading">
            <div><p class="eyebrow">BLOG IN ZAHLEN</p><h2 id="blog-statistics-title">Was im Wissensnetz steckt</h2></div>
            <p>Live aus den veröffentlichten Artikeln, dem Glossar und den Verbindungen des Wissensnetzes berechnet.</p>
          </div>
          <div class="blog-statistics__cards" data-statistics-cards></div>
          <div class="blog-statistics__visuals">
            <article class="statistics-panel statistics-panel--heatmap"><div data-publication-heatmap></div></article>
            <article class="statistics-panel"><header><h3>Themenprofil</h3><p>Abdeckung in sechs stabilen, übergeordneten Themenfeldern</p></header><div data-category-radar></div></article>
          </div>
        </section>
      </section>`;

    return main.querySelector('.knowledge-network');
  }

  function formatReadingTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours} Std. ${rest ? `${rest} Min.` : ''}`.trim() : `${minutes} Min.`;
  }

  function formatMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return '–';
    return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${value}-01T00:00:00Z`));
  }

  function renderStatistics(section, statistics) {
    const mostUsedTerm = statistics.mostUsedGlossaryTerm || {};
    const values = [
      ['Wörter insgesamt', Number(statistics.words || 0).toLocaleString('de-DE')],
      ['Lesezeit gesamt', formatReadingTime(Number(statistics.readingMinutes || 0))],
      ['Verlinkte Fachbegriffe', Number(statistics.glossaryTerms || 0).toLocaleString('de-DE')],
      ['Ø Wörter je Artikel', Number(statistics.averageWords || 0).toLocaleString('de-DE')],
      ['Aktivster Monat', formatMonth(statistics.busiestMonth)],
      [`Meistgenutzter Fachbegriff${mostUsedTerm.count ? ` · ${Number(mostUsedTerm.count).toLocaleString('de-DE')}×` : ''}`, mostUsedTerm.term || '–']
    ];
    section.querySelector('[data-statistics-cards]').innerHTML = values
      .map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`)
      .join('');
    section.querySelector('[data-publication-heatmap]').innerHTML = publicationHeatmap(statistics.publicationDays);
    section.querySelector('[data-category-radar]').innerHTML = categoryRadar(statistics.topicDistribution);
  }

  function publicationHeatmap(days, now = new Date()) {
    const counts = new Map((days || []).map((item) => [item.date, Number(item.count) || 0]));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekday = (end.getUTCDay() + 6) % 7;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - weekday - (51 * 7));
    const totalDays = (51 * 7) + weekday + 1;
    const cells = [];
    const monthLabels = [];
    let total = 0;
    let previousMonth = '';
    for (let index = 0; index < totalDays; index += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      const date = day.toISOString().slice(0, 10);
      const count = counts.get(date) || 0;
      total += count;
      const week = Math.floor(index / 7);
      if (index % 7 === 0) {
        const month = date.slice(0, 7);
        if (month !== previousMonth) {
          const label = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format(day).replace('.', '');
          monthLabels.push(`<text x="${42 + (week * 13)}" y="11">${label}</text>`);
          previousMonth = month;
        }
      }
      cells.push(`<rect x="${42 + (week * 13)}" y="${24 + ((index % 7) * 13)}" width="10" height="10" rx="2" class="heat-day heat-${Math.min(4, count)}"><title>${date}: ${count} Artikel</title></rect>`);
    }
    const publicationLabel = total === 1 ? 'Veröffentlichung' : 'Veröffentlichungen';
    return `<div class="heatmap-summary"><strong>${total} ${publicationLabel} im letzten Jahr</strong><span>${now.getUTCFullYear()}</span></div>
      <div class="heatmap-chart">
        <svg class="publication-heatmap" viewBox="0 0 720 118" role="img" aria-label="Heatmap der Veröffentlichungen in den letzten 52 Wochen">
          <g class="heatmap-labels">${monthLabels.join('')}<text x="3" y="47">Mo</text><text x="3" y="73">Mi</text><text x="3" y="99">Fr</text></g>${cells.join('')}
        </svg>
      </div>
      <div class="heatmap-footer"><span>Jedes Feld entspricht einem Tag.</span><div class="heatmap-legend"><span>Weniger</span><i class="heat-0"></i><i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><i class="heat-4"></i><span>Mehr</span></div></div>`;
  }

  function categoryRadar(distribution) {
    const axes = (distribution || []).slice(0, 6);
    if (axes.length < 3) return '<p class="statistics-empty">Noch nicht genügend Kategorien für ein Themenprofil.</p>';
    const center = 150;
    const radius = 98;
    const maximum = Math.max(...axes.map((item) => Number(item.value) || 0), 1);
    const point = (index, scale = 1) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / axes.length);
      return [center + Math.cos(angle) * radius * scale, center + Math.sin(angle) * radius * scale];
    };
    const rings = [0.25, 0.5, 0.75, 1].map((scale) => `<polygon points="${axes.map((_item, index) => point(index, scale).join(',')).join(' ')}" />`).join('');
    const spokes = axes.map((_item, index) => `<line x1="${center}" y1="${center}" x2="${point(index)[0]}" y2="${point(index)[1]}" />`).join('');
    const area = axes.map((item, index) => point(index, Number(item.value) / maximum).join(',')).join(' ');
    const labels = axes.map((item, index) => {
      const [x, y] = point(index, 1.22);
      return `<text x="${x}" y="${y}" text-anchor="middle">${item.label} (${item.value})</text>`;
    }).join('');
    return `<svg class="category-radar" viewBox="0 0 300 300" role="img" aria-label="Spinnendiagramm der thematischen Blogabdeckung"><g class="radar-grid">${rings}${spokes}</g><polygon class="radar-area" points="${area}" />${labels}</svg>`;
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

  function semanticLinkLabel(link) {
    if (link.type !== 'semantic') {
      return link.type === 'tag' ? 'gemeinsamer Tag' : 'Kategorie';
    }

    const parts = [`Vektorähnlichkeit ${Number(link.similarity || 0).toFixed(3)}`];
    if (link.sharedTags?.length) {
      parts.push(`Tags: ${link.sharedTags.join(', ')}`);
    }
    if (link.sameCategory) {
      parts.push('gleiche Kategorie');
    }
    return parts.join(' · ');
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
      .linkLabel(semanticLinkLabel)
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
      const [response] = await Promise.all([
        fetch('/api/knowledge?limit=5', { headers: { Accept: 'application/json' } }),
        loadForceGraph()
      ]);
      if (!response.ok) {
        throw new Error(`Wissensdaten konnten nicht geladen werden (${response.status}).`);
      }

      const payload = await response.json();
      const posts = Array.isArray(payload.articles) ? payload.articles : [];
      const semanticEdges = Array.isArray(payload.edges) ? payload.edges : [];
      if (posts.length === 0) {
        throw new Error('Keine Artikel-Vektoren für das Wissensnetz vorhanden.');
      }

      const graphData = buildGraphData(posts, semanticEdges);
      section.querySelector('[data-stat="articles"]').textContent = String(posts.length);
      section.querySelector('[data-stat="semantic"]').textContent = String(semanticEdges.length);
      section.querySelector('[data-stat="topics"]').textContent = String(
        graphData.nodes.filter((node) => node.type !== 'article').length
      );
      section.dataset.knowledgeReady = 'true';
      section.dataset.embeddingModel = String(payload.embeddingModel || '');
      renderStatistics(section, payload.statistics || {});
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
      semanticLinkLabel,
      publicationHeatmap,
      categoryRadar
    };
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initialize();
  }
})();
