(() => {
  const FORCE_GRAPH_SRC = 'https://cdn.jsdelivr.net/npm/force-graph@1.51.4/dist/force-graph.min.js';
  const MAX_RELATED_POSTS = 10;
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
    const tags = [...document.querySelectorAll('.post-page > .tag-list .tag-chip')]
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

  function selectPosts(posts, currentPost, semanticPosts) {
    const selected = [{ ...currentPost, semanticScore: 1 }];
    const seen = new Set([currentPost.slug]);

    for (const post of semanticPosts) {
      if (seen.has(post.slug)) {
        continue;
      }
      selected.push(post);
      seen.add(post.slug);
      if (selected.length >= MAX_RELATED_POSTS + 1) {
        return selected;
      }
    }

    for (const post of metadataFallback(posts, currentPost)) {
      if (seen.has(post.slug)) {
        continue;
      }
      selected.push(post);
      seen.add(post.slug);
      if (selected.length >= MAX_RELATED_POSTS + 1) {
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
        semanticScore: Number(post.semanticScore) || 0
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

  function ensureStyles() {
    if (document.querySelector('link[data-knowledge-graph-style]')) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/knowledge-graph.css';
    link.dataset.knowledgeGraphStyle = 'true';
    document.head.append(link);
  }

  function createGraphSection() {
    const terminal = document.querySelector('.post-page .terminal-post');
    if (!terminal || document.querySelector('.knowledge-graph')) {
      return null;
    }

    const currentTitle = document.querySelector('.post-page > h1')?.textContent?.trim() || 'article-graph';
    const chromeTitle = `knowledge-graph://kernel-notes/${shortLabel(currentTitle, 56)}`;

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
          <h2 id="knowledge-graph-title">Semantisch verwandte Artikel & Themen</h2>
          <p class="knowledge-graph__hint">Vektorähnlichkeit aus Kernel Grep · Tags und Kategorien erklären die Verbindung · Ziehen, zoomen, anklicken</p>
        </div>
        <div class="knowledge-graph__legend" aria-label="Legende">
          <span><i style="--node-color:${COLORS.current}"></i>Dieser Artikel</span>
          <span><i style="--node-color:${COLORS.article}"></i>Artikel</span>
          <span><i style="--node-color:${COLORS.tag}"></i>Tag</span>
          <span><i style="--node-color:${COLORS.category}"></i>Kategorie</span>
        </div>
      </div>
      <div class="knowledge-graph__canvas" role="img" aria-label="Interaktiver semantischer Wissensgraph zu diesem Artikel">
        <p class="knowledge-graph__status">Graph wird geladen…</p>
      </div>`;

    section.querySelector('.knowledge-graph__chrome-title').textContent = chromeTitle;
    terminal.insertAdjacentElement('afterend', section);
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

  function renderGraph(canvas, graphData) {
    const height = window.matchMedia('(max-width: 720px)').matches ? 360 : 440;
    let hoveredNode = null;
    let fitted = false;

    canvas.innerHTML = '';

    const graph = window.ForceGraph()(canvas)
      .graphData(graphData)
      .width(Math.max(280, canvas.clientWidth))
      .height(height)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeId('id')
      .nodeVal('val')
      .nodeRelSize(2.35)
      .nodeColor((node) => node.color)
      .nodeLabel(nodeDescription)
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject(drawNodeLabel)
      .linkColor((link) => {
        if (hoveredNode) {
          return connectedTo(link, hoveredNode) ? 'rgba(0, 71, 62, 0.72)' : 'rgba(42, 48, 54, 0.08)';
        }
        if (link.type === 'semantic') {
          return 'rgba(91, 156, 246, 0.42)';
        }
        return link.current ? 'rgba(242, 145, 61, 0.5)' : 'rgba(42, 48, 54, 0.16)';
      })
      .linkWidth((link) => {
        if (hoveredNode && connectedTo(link, hoveredNode)) {
          return 2.4;
        }
        if (link.type === 'semantic') {
          return Math.min(3, 1 + (Number(link.score) || 0) * 2);
        }
        return link.current ? 1.8 : 0.9;
      })
      .onNodeHover((node) => {
        hoveredNode = node || null;
        canvas.style.cursor = node?.href ? 'pointer' : 'grab';
        graph.linkColor(graph.linkColor());
        graph.linkWidth(graph.linkWidth());
      })
      .onNodeClick((node) => {
        if (node?.href) {
          window.location.href = node.href;
        }
      })
      .onEngineStop(() => {
        if (fitted) {
          return;
        }
        fitted = true;
        graph.zoomToFit(450, 55);
      });

    const charge = graph.d3Force('charge');
    charge?.strength?.(-125);
    const linkForce = graph.d3Force('link');
    linkForce?.distance?.((link) => {
      if (link.type === 'semantic') return 108;
      return link.type === 'category' ? 88 : 72;
    });

    window.addEventListener('resize', () => {
      graph.width(Math.max(280, canvas.clientWidth));
    });
  }

  async function initialize(section) {
    const canvas = section.querySelector('.knowledge-graph__canvas');
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

      const selectedPosts = selectPosts(posts, currentPost, semanticPosts);
      const graphData = buildGraphData(selectedPosts, currentPost);

      if (!graphData.nodes.length) {
        throw new Error('Keine Graphdaten verfügbar.');
      }

      renderGraph(canvas, graphData);
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
