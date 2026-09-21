(() => {
  const FORCE_GRAPH_SRC = 'https://cdn.jsdelivr.net/npm/force-graph@1.51.4/dist/force-graph.min.js';
  const MAX_RELATED_POSTS = 8;
  const COMPACT_RELATED_POSTS = 5;
  const COLORS = {
    current: '#f2913d',
    article: '#5b9cf6',
    tag: '#ef6a6a',
    category: '#9b83f3'
  };

  let forceGraphPromise;

  function normalizeTags(tags) {
    return Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
  }

  function normalized(value) {
    return String(value || '').trim().toLocaleLowerCase('de');
  }

  function shortLabel(value, maxLength) {
    const label = String(value || '').trim();
    if (label.length <= maxLength) {
      return label;
    }
    return `${label.slice(0, Math.max(1, maxLength - 1))}…`;
  }

  function postSlugFromPath() {
    const match = window.location.pathname.match(/^\/(?:posts|archive)\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function currentPostFromDom() {
    const slug = postSlugFromPath();
    const title = document.querySelector('.post-page > h1')?.textContent?.trim() || slug;
    const meta = document.querySelector('.post-page > .meta')?.textContent || '';
    const category = meta.split('·')[0]?.trim() || 'IT';
    const tags = [...document.querySelectorAll('.post-page > .tag-list .tag-chip:not([data-tag-toggle])')]
      .map((chip) => chip.textContent?.trim())
      .filter(Boolean);

    return {
      slug,
      title,
      category,
      tags,
      excerpt: '',
      archived: window.location.pathname.startsWith('/archive/')
    };
  }

  function resolveCurrentPost(posts, fallback) {
    const exact = posts.find((post) => post.slug === fallback.slug);
    if (exact) {
      return { ...exact, archived: false };
    }

    const normalizedSlug = normalized(fallback.slug);
    const suffixMatch = posts.find((post) => normalized(post.slug).endsWith(`-${normalizedSlug}`));
    return suffixMatch ? { ...suffixMatch, archived: false } : fallback;
  }

  function relationshipScore(currentPost, candidatePost) {
    if (!candidatePost || currentPost.slug === candidatePost.slug) {
      return -1;
    }

    let score = 0;
    if (normalized(currentPost.category) === normalized(candidatePost.category)) {
      score += 5;
    }

    const currentTags = new Set(normalizeTags(currentPost.tags).map(normalized));
    normalizeTags(candidatePost.tags).forEach((tag) => {
      if (currentTags.has(normalized(tag))) {
        score += 3;
      }
    });

    return score;
  }

  function metadataFallback(posts, currentPost) {
    return posts
      .filter((post) => post.slug !== currentPost.slug)
      .map((post) => ({ post, score: relationshipScore(currentPost, post) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ post }) => ({ ...post, archived: false }));
  }

  function semanticQuery(post) {
    return [
      post.title,
      post.category,
      normalizeTags(post.tags).join(' '),
      post.excerpt
    ]
      .filter(Boolean)
      .join(' · ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
  }

  async function semanticRelatedPosts(posts, currentPost) {
    const query = semanticQuery(currentPost);
    if (query.length < 2 || currentPost.archived) {
      return [];
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(12, MAX_RELATED_POSTS + 2))
    });
    const response = await fetch(`/api/search?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Semantische Beziehungen konnten nicht geladen werden (${response.status}).`);
    }

    const payload = await response.json();
    const postsBySlug = new Map(posts.map((post) => [post.slug, post]));
    const selected = [];
    const seen = new Set([currentPost.slug]);

    for (const result of Array.isArray(payload.results) ? payload.results : []) {
      if (!result?.slug || seen.has(result.slug)) {
        continue;
      }
      const post = postsBySlug.get(result.slug);
      if (!post) {
        continue;
      }
      seen.add(result.slug);
      selected.push({
        ...post,
        archived: false,
        semanticScore: Number(result.score) || 0,
        semanticRelevanceScore: Number(result.relevanceScore) || Number(result.score) || 0
      });
      if (selected.length >= MAX_RELATED_POSTS) {
        break;
      }
    }

    return selected;
  }

  function selectPosts(posts, currentPost, semanticPosts, maxRelatedPosts = MAX_RELATED_POSTS) {
    const selected = [{ ...currentPost, semanticScore: 1 }];
    const seen = new Set([currentPost.slug]);

    for (const post of semanticPosts) {
      if (seen.has(post.slug)) {
        continue;
      }
      selected.push(post);
      seen.add(post.slug);
      if (selected.length >= maxRelatedPosts + 1) {
        return selected;
      }
    }

    for (const post of metadataFallback(posts, currentPost)) {
      if (seen.has(post.slug)) {
        continue;
      }
      selected.push(post);
      seen.add(post.slug);
      if (selected.length >= maxRelatedPosts + 1) {
        break;
      }
    }

    return selected;
  }

  function buildGraphData(selectedPosts, currentPost) {
    const nodes = [];
    const links = [];
    const nodeIds = new Set();
    const tagFrequency = new Map();
    const currentTags = new Set(normalizeTags(currentPost.tags).map(normalized));
    const currentPostId = `post:${currentPost.slug}`;

    selectedPosts.forEach((post) => {
      normalizeTags(post.tags).forEach((tag) => {
        const key = normalized(tag);
        const entry = tagFrequency.get(key) || { label: tag, count: 0 };
        entry.count += 1;
        tagFrequency.set(key, entry);
      });
    });

    function addNode(node) {
      if (nodeIds.has(node.id)) {
        return;
      }
      nodeIds.add(node.id);
      nodes.push(node);
    }

    selectedPosts.forEach((post) => {
      const isCurrent = post.slug === currentPost.slug;
      const postId = `post:${post.slug}`;
      addNode({
        id: postId,
        label: post.title,
        type: isCurrent ? 'current' : 'article',
        href: post.archived ? `/archive/${post.slug}` : `/posts/${post.slug}`,
        color: isCurrent ? COLORS.current : COLORS.article,
        semanticScore: Number(post.semanticScore) || 0,
        category: post.category || '',
        tags: normalizeTags(post.tags)
      });

      if (!isCurrent && Number(post.semanticScore) > 0) {
        links.push({
          source: currentPostId,
          target: postId,
          type: 'semantic',
          score: Number(post.semanticScore),
          current: true
        });
      }

      const categoryLabel = String(post.category || 'IT').trim();
      const categoryId = `category:${normalized(categoryLabel)}`;
      addNode({
        id: categoryId,
        label: categoryLabel,
        type: 'category',
        href: '/#topics',
        color: COLORS.category
      });
      links.push({
        source: postId,
        target: categoryId,
        type: 'category',
        current: isCurrent
      });

      normalizeTags(post.tags).forEach((tag) => {
        const key = normalized(tag);
        const frequency = tagFrequency.get(key)?.count || 0;
        if (frequency < 2 && !currentTags.has(key)) {
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
        links.push({
          source: postId,
          target: tagId,
          type: 'tag',
          current: isCurrent
        });
      });
    });

    const degree = new Map();
    links.forEach((link) => {
      const source = typeof link.source === 'object' ? link.source.id : link.source;
      const target = typeof link.target === 'object' ? link.target.id : link.target;
      degree.set(source, (degree.get(source) || 0) + 1);
      degree.set(target, (degree.get(target) || 0) + 1);
    });

    nodes.forEach((node) => {
      const connections = degree.get(node.id) || 0;
      if (node.type === 'current') {
        node.val = 10;
      } else if (node.type === 'article') {
        node.val = Math.min(8, 3.5 + connections * 0.9);
      } else if (node.type === 'category') {
        node.val = Math.min(8, 2.5 + connections * 1.15);
      } else {
        node.val = Math.min(7, 1.8 + connections * 0.95);
      }
    });

    return { nodes, links };
  }

  function linkEndpointId(endpoint) {
    return typeof endpoint === 'object' ? endpoint?.id : endpoint;
  }

  function compactGraphData(graphData, currentPost, maxTopics = 7) {
    const currentId = `post:${currentPost.slug}`;
    const articleNodes = graphData.nodes.filter((node) => node.type === 'current' || node.type === 'article');
    const articleIds = new Set(articleNodes.map((node) => node.id));
    const topicDegree = new Map();
    const currentTopics = new Set();

    graphData.links.forEach((link) => {
      if (link.type === 'semantic') return;
      const source = linkEndpointId(link.source);
      const target = linkEndpointId(link.target);
      const topicId = source.startsWith('post:') ? target : source;
      topicDegree.set(topicId, (topicDegree.get(topicId) || 0) + 1);
      if (source === currentId) currentTopics.add(target);
      if (target === currentId) currentTopics.add(source);
    });

    const topicNodes = graphData.nodes
      .filter((node) => node.type === 'tag' || node.type === 'category')
      .sort((left, right) => {
        const leftCurrent = currentTopics.has(left.id) ? 1 : 0;
        const rightCurrent = currentTopics.has(right.id) ? 1 : 0;
        if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
        return (topicDegree.get(right.id) || 0) - (topicDegree.get(left.id) || 0);
      })
      .slice(0, maxTopics);

    const keepIds = new Set([...articleIds, ...topicNodes.map((node) => node.id)]);
    return {
      nodes: [...articleNodes, ...topicNodes],
      links: graphData.links.filter((link) => (
        keepIds.has(linkEndpointId(link.source))
        && keepIds.has(linkEndpointId(link.target))
      ))
    };
  }

  function ensureStyles() {
    if (document.querySelector('link[data-knowledge-graph-style]')) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/knowledge-graph.css?v=20260921-2';
    link.dataset.knowledgeGraphStyle = 'true';
    document.head.append(link);
  }

  function createGraphSection() {
    const terminal = document.querySelector('.post-page .terminal-post');
    if (!terminal || document.querySelector('.knowledge-graph')) {
      return null;
    }

    const engagement = document.querySelector('.post-page .article-engagement');
    const currentTitle = document.querySelector('.post-page > h1')?.textContent?.trim() || 'article-graph';
    const chromeTitle = `knowledge://kernel-notes/${shortLabel(currentTitle, 56)}`;

    const section = document.createElement('section');
    section.className = 'knowledge-graph';
    section.setAttribute('aria-labelledby', 'knowledge-graph-title');
    section.innerHTML = `
      <div class="knowledge-graph__chrome" aria-hidden="true">
        <div class="knowledge-graph__chrome-controls">
          <span class="knowledge-graph__chrome-dot is-red"></span>
          <span class="knowledge-graph__chrome-dot is-yellow"></span>
          <span class="knowledge-graph__chrome-dot is-green"></span>
        </div>
        <div class="knowledge-graph__chrome-title"></div>
      </div>
      <div class="knowledge-graph__head">
        <div>
          <p class="eyebrow">Wissensnetz</p>
          <h2 id="knowledge-graph-title">Verwandt im Wissensnetz</h2>
          <p class="knowledge-graph__hint">Semantische Nähe, gemeinsame Tags und Kategorien verbinden diesen Artikel mit weiteren Notizen.</p>
        </div>
        <a class="knowledge-graph__network-link" href="/knowledge">Gesamtes Wissensnetz →</a>
        <div class="knowledge-graph__legend" aria-label="Legende">
          <span><i style="--node-color:${COLORS.current}"></i>Dieser Artikel</span>
          <span><i style="--node-color:${COLORS.article}"></i>Artikel</span>
          <span><i style="--node-color:${COLORS.tag}"></i>Tag</span>
          <span><i style="--node-color:${COLORS.category}"></i>Kategorie</span>
        </div>
      </div>
      <div class="knowledge-graph__canvas" role="img" aria-label="Interaktiver semantischer Wissensgraph zu diesem Artikel">
        <p class="knowledge-graph__status">Graph wird geladen…</p>
      </div>
      <aside class="knowledge-graph__selection" data-knowledge-selection hidden aria-live="polite">
        <div>
          <span data-knowledge-selection-type></span>
          <strong data-knowledge-selection-title></strong>
          <p data-knowledge-selection-meta></p>
        </div>
        <div class="knowledge-graph__selection-actions">
          <a data-knowledge-selection-open href="/">Öffnen</a>
          <button type="button" data-knowledge-selection-close>Schließen</button>
        </div>
      </aside>`;

    section.querySelector('.knowledge-graph__chrome-title').textContent = chromeTitle;
    (engagement || terminal).insertAdjacentElement('afterend', section);
    return section;
  }

  function loadForceGraph() {
    if (typeof window.ForceGraph === 'function') {
      return Promise.resolve(window.ForceGraph);
    }

    if (forceGraphPromise) {
      return forceGraphPromise;
    }

    forceGraphPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = FORCE_GRAPH_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.forceGraph = '1.51.4';
      script.addEventListener('load', () => {
        if (typeof window.ForceGraph === 'function') {
          resolve(window.ForceGraph);
          return;
        }
        reject(new Error('force-graph wurde geladen, aber ForceGraph ist nicht verfügbar.'));
      });
      script.addEventListener('error', () => reject(new Error('force-graph konnte nicht geladen werden.')));
      document.head.append(script);
    });

    return forceGraphPromise;
  }

  function connectedTo(link, node) {
    if (!node) {
      return false;
    }
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    return source === node.id || target === node.id;
  }

  function drawNodeLabel(node, ctx, globalScale) {
    const fontSize = 11 / globalScale;
    const label = shortLabel(node.label, node.type === 'article' || node.type === 'current' ? 34 : 22);
    const radius = Math.sqrt(Number(node.val) || 1) * 2.35;

    ctx.font = `500 ${fontSize}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#30353b';
    ctx.fillText(label, node.x + radius + (4 / globalScale), node.y);
  }

  function nodeDescription(node) {
    const type = node.type === 'current'
      ? 'Dieser Artikel'
      : node.type === 'article'
        ? 'Artikel'
        : node.type === 'tag'
          ? 'Tag'
          : 'Kategorie';
    if (node.type === 'article' && Number(node.semanticScore) > 0) {
      return `${type}: ${node.label} · Vektorähnlichkeit ${Number(node.semanticScore).toFixed(3)}`;
    }
    return `${type}: ${node.label}`;
  }

  function renderGraph(section, graphData) {
    const canvas = section.querySelector('.knowledge-graph__canvas');
    const selection = section.querySelector('[data-knowledge-selection]');
    const selectionType = selection?.querySelector('[data-knowledge-selection-type]');
    const selectionTitle = selection?.querySelector('[data-knowledge-selection-title]');
    const selectionMeta = selection?.querySelector('[data-knowledge-selection-meta]');
    const selectionOpen = selection?.querySelector('[data-knowledge-selection-open]');
    const selectionClose = selection?.querySelector('[data-knowledge-selection-close]');
    const compact = window.matchMedia('(max-width: 720px)').matches;
    const height = compact ? 320 : 440;
    let hoveredNode = null;
    let selectedNode = null;
    let fitted = false;

    canvas.innerHTML = '';

    function focusNode() {
      return hoveredNode || selectedNode;
    }

    function neighborIds(node) {
      const ids = new Set(node ? [node.id] : []);
      if (!node) return ids;
      graph.graphData().links.forEach((link) => {
        const source = linkEndpointId(link.source);
        const target = linkEndpointId(link.target);
        if (source === node.id) ids.add(target);
        if (target === node.id) ids.add(source);
      });
      return ids;
    }

    function refreshGraphStyle() {
      graph.nodeColor(graph.nodeColor());
      graph.nodeCanvasObject(graph.nodeCanvasObject());
      graph.linkColor(graph.linkColor());
      graph.linkWidth(graph.linkWidth());
    }

    function showSelection(node) {
      selectedNode = node || null;
      if (!selection) return;
      if (!node) {
        selection.hidden = true;
        refreshGraphStyle();
        return;
      }

      selectionType.textContent = node.type === 'current'
        ? 'Dieser Artikel'
        : node.type === 'article'
          ? 'Artikel'
          : node.type === 'tag'
            ? 'Tag'
            : 'Kategorie';
      selectionTitle.textContent = node.label;
      const details = node.type === 'article' || node.type === 'current'
        ? [
            Number(node.semanticScore) > 0 && node.type === 'article'
              ? `Ähnlichkeit ${Number(node.semanticScore).toFixed(3)}`
              : '',
            node.category,
            ...(node.tags || []).slice(0, 3)
          ].filter(Boolean)
        : [node.type === 'tag' ? 'Gemeinsames Thema' : 'Gemeinsame Kategorie'];
      selectionMeta.textContent = details.join(' · ');
      selectionOpen.href = node.href || '#';
      selection.hidden = false;
      refreshGraphStyle();
    }

    const graph = window.ForceGraph()(canvas)
      .graphData(graphData)
      .width(Math.max(280, canvas.clientWidth))
      .height(height)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeId('id')
      .nodeVal('val')
      .nodeRelSize(compact ? 2.55 : 2.3)
      .nodeColor((node) => {
        const focus = focusNode();
        if (focus && !neighborIds(focus).has(node.id)) {
          return 'rgba(112, 120, 128, 0.16)';
        }
        return node.color;
      })
      .nodeLabel(nodeDescription)
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject((node, ctx, globalScale) => {
        const shouldLabel = node.type === 'current'
          || node === hoveredNode
          || node === selectedNode
          || (
            node.type !== 'article'
            && globalScale >= (compact ? 1.3 : 0.72)
          );
        if (shouldLabel) drawNodeLabel(node, ctx, globalScale);
      })
      .linkColor((link) => {
        const focus = focusNode();
        if (focus) {
          return connectedTo(link, focus) ? 'rgba(0, 71, 62, 0.62)' : 'rgba(42, 48, 54, 0.025)';
        }
        if (link.type === 'semantic') {
          return compact ? 'rgba(91, 156, 246, 0.14)' : 'rgba(91, 156, 246, 0.24)';
        }
        return link.current ? 'rgba(242, 145, 61, 0.24)' : 'rgba(42, 48, 54, 0.08)';
      })
      .linkWidth((link) => {
        const focus = focusNode();
        if (focus && connectedTo(link, focus)) return 2.2;
        if (link.type === 'semantic') {
          return compact ? 0.65 : Math.min(1.6, 0.55 + (Number(link.score) || 0));
        }
        return link.current ? 1 : 0.55;
      })
      .onNodeHover((node) => {
        hoveredNode = node || null;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        refreshGraphStyle();
      })
      .onNodeClick((node) => {
        if (node) showSelection(node);
      })
      .onBackgroundClick(() => showSelection(null))
      .onEngineStop(() => {
        if (fitted) return;
        fitted = true;
        graph.zoomToFit(500, compact ? 30 : 55);
      });

    graph.d3Force('charge')?.strength?.(compact ? -160 : -125);
    graph.d3Force('link')?.distance?.((link) => {
      if (link.type === 'semantic') return compact ? 112 : 108;
      return link.type === 'category' ? (compact ? 82 : 88) : (compact ? 72 : 72);
    });

    selectionClose?.addEventListener('click', () => showSelection(null));

    window.addEventListener('resize', () => {
      graph.width(Math.max(280, canvas.clientWidth));
    });
  }
  async function initialize(section) {
    const status = section.querySelector('.knowledge-graph__status');

    try {
      const [response] = await Promise.all([
        fetch('/api/posts'),
        loadForceGraph()
      ]);

      if (!response.ok) {
        throw new Error(`Artikel konnten nicht geladen werden (${response.status}).`);
      }

      const posts = await response.json();
      const fallbackCurrent = currentPostFromDom();
      const currentPost = resolveCurrentPost(posts, fallbackCurrent);
      let semanticPosts = [];

      try {
        semanticPosts = await semanticRelatedPosts(posts, currentPost);
        section.dataset.relationshipSource = semanticPosts.length ? 'rag' : 'metadata';
      } catch (error) {
        console.warn('Semantic knowledge graph fallback:', error.message || error);
        section.dataset.relationshipSource = 'metadata-fallback';
      }

      const compact = window.matchMedia('(max-width: 720px)').matches;
      const selectedPosts = selectPosts(
        posts,
        currentPost,
        semanticPosts,
        compact ? COMPACT_RELATED_POSTS : MAX_RELATED_POSTS
      );
      let graphData = buildGraphData(selectedPosts, currentPost);
      if (compact) {
        graphData = compactGraphData(graphData, currentPost);
      }

      if (!graphData.nodes.length) {
        throw new Error('Keine Graphdaten verfügbar.');
      }

      renderGraph(section, graphData);
    } catch (error) {
      if (status) {
        status.textContent = `Graph konnte nicht geladen werden: ${error.message}`;
        status.classList.add('is-error');
      }
    }
  }

  ensureStyles();
  const section = createGraphSection();
  if (!section) {
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) {
      return;
    }
    observer.disconnect();
    initialize(section);
  }, { rootMargin: '240px 0px' });

  observer.observe(section);
})();
