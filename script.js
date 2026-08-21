function ensureKernelBrandAssets() {
  if (!document.querySelector('link[rel="icon"]')) {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    favicon.href = '/assets/favicon.svg';
    document.head.append(favicon);
  }

  if (!document.querySelector('link[data-kernel-typewriter]')) {
    const typewriter = document.createElement('link');
    typewriter.rel = 'stylesheet';
    typewriter.href = '/assets/css/typewriter.css';
    typewriter.dataset.kernelTypewriter = '';
    document.head.append(typewriter);
  }
}

ensureKernelBrandAssets();

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const delay = Number(entry.target.dataset.delay || 0);
      window.setTimeout(() => {
        entry.target.classList.add('in');
      }, delay);

      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.18 }
);

function observeRevealItems(container = document) {
  const revealItems = [...container.querySelectorAll('.reveal')];
  revealItems.forEach((item) => {
    if (!item.classList.contains('in')) {
      observer.observe(item);
    }
  });
}

function formatDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return dateInput;
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

const MAX_VISIBLE_TAGS = 10;

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean);
}

function visibleTags(tags) {
  return sanitizeTags(tags).slice(0, MAX_VISIBLE_TAGS);
}

function topicLabel(topic) {
  if (topic.startsWith('tag:')) {
    return topic.slice(4);
  }

  if (topic.startsWith('category:')) {
    return topic.slice(9);
  }

  return 'Alle';
}

function renderPosts(posts) {
  const list = document.getElementById('posts-list');
  if (!list) {
    return;
  }

  if (!posts.length) {
    list.innerHTML = '<p>Noch keine Artikel vorhanden.</p>';
    return;
  }

  list.innerHTML = posts
    .map((post, index) => {
      const delay = 240 + index * 60;
      const meta = `${post.category} · ${formatDate(post.date)}`;
      const tags = visibleTags(post.tags);
      const tagsHtml = tags.length
        ? `<div class="post-tags">${tags.map((tag) => `<span class="tag-chip">${tag}</span>`).join('')}</div>`
        : '';
      return `
        <article class="post-card reveal" data-delay="${delay}" data-href="/posts/${post.slug}" role="link" tabindex="0" aria-label="${post.title} oeffnen">
          <p class="meta">${meta}</p>
          <h3>${post.title}</h3>
          <p>${post.excerpt}</p>
          ${tagsHtml}
          <span class="read-more">Artikel lesen</span>
        </article>
      `;
    })
    .join('');

  setupPostCardNavigation(list);
  observeRevealItems(list);
}

function setupPostCardNavigation(container) {
  const cards = [...container.querySelectorAll('.post-card[data-href]')];

  cards.forEach((card) => {
    const href = card.dataset.href;
    if (!href) {
      return;
    }

    card.addEventListener('click', () => {
      window.location.href = href;
    });

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      window.location.href = href;
    });
  });
}

function getTopics(posts) {
  const unique = new Set();

  posts.forEach((post) => {
    const category = (post.category || 'IT').trim();
    if (category) {
      unique.add(`category:${category}`);
    }

    const tags = sanitizeTags(post.tags);
    tags.forEach((tag) => {
      unique.add(`tag:${tag}`);
    });
  });

  return ['all', ...[...unique].sort((a, b) => topicLabel(a).localeCompare(topicLabel(b), 'de'))];
}

function renderTopics(posts, selectedTopics) {
  const list = document.getElementById('topics-list');
  if (!list) {
    return;
  }

  const topics = getTopics(posts);

  if (!topics.length) {
    list.innerHTML = '<p>Noch keine Themen vorhanden.</p>';
    return;
  }

  list.innerHTML = topics
    .map((name, index) => {
      const delay = 180 + index * 40;
      const isActive = name === 'all' ? selectedTopics.size === 0 : selectedTopics.has(name);
      const label = topicLabel(name);
      return `
        <button
          class="topic reveal ${isActive ? 'is-active' : ''}"
          data-delay="${delay}"
          data-topic="${name}"
          aria-pressed="${isActive ? 'true' : 'false'}"
          type="button"
        >${label}</button>
      `;
    })
    .join('');

  observeRevealItems(list);
}

function filterPostsByTopics(posts, selectedTopics) {
  if (!selectedTopics || selectedTopics.size === 0) {
    return posts;
  }

  const selected = [...selectedTopics];

  return posts.filter((post) => {
    const category = (post.category || 'IT').trim();
    const tags = sanitizeTags(post.tags).map((tag) => tag.toLowerCase());

    return selected.some((topic) => {
      if (topic.startsWith('tag:')) {
        const wantedTag = topic.slice(4).trim().toLowerCase();
        return tags.includes(wantedTag);
      }

      if (topic.startsWith('category:')) {
        return category === topic.slice(9);
      }

      return false;
    });
  });
}

function toggleTopic(selectedTopics, topic) {
  if (!topic || topic === 'all') {
    selectedTopics.clear();
    return;
  }

  if (selectedTopics.has(topic)) {
    selectedTopics.delete(topic);
    return;
  }

  selectedTopics.add(topic);
}

async function loadPosts() {
  const postsList = document.getElementById('posts-list');
  const topicsList = document.getElementById('topics-list');
  if (!postsList || !topicsList) {
    return;
  }

  try {
    const response = await fetch('/api/posts');
    if (!response.ok) {
      throw new Error('Cannot load posts');
    }

    const posts = await response.json();
    const selectedTopics = new Set();

    const applyView = () => {
      const visiblePosts = filterPostsByTopics(posts, selectedTopics);
      renderPosts(visiblePosts);
      renderTopics(posts, selectedTopics);
    };

    topicsList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-topic]');
      if (!button) {
        return;
      }

      const topic = button.dataset.topic || 'all';
      toggleTopic(selectedTopics, topic);
      applyView();
    });

    applyView();
  } catch (_error) {
    postsList.innerHTML = '<p>Artikel konnten gerade nicht geladen werden.</p>';
    topicsList.innerHTML = '<p>Themen konnten gerade nicht geladen werden.</p>';
  }
}

function figureIdFromImage(image, fallbackIndex) {
  const src = image.getAttribute('src') || '';
  const fileName = src.split('/').pop()?.split(/[?#]/)[0] || `image-${fallbackIndex}`;
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_]/, '');
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `fig-${slug || fallbackIndex}`;
}

function setupPostFigures() {
  const images = [...document.querySelectorAll('.terminal-content img')];
  const usedIds = new Set();

  images.forEach((image, index) => {
    const imageParagraph = image.parentElement?.tagName === 'P' ? image.parentElement : null;
    if (!imageParagraph || imageParagraph.children.length !== 1) {
      return;
    }

    const nextParagraph = imageParagraph.nextElementSibling;
    let caption = image.getAttribute('title') || image.getAttribute('alt') || `Abbildung ${index + 1}`;

    if (
      nextParagraph?.tagName === 'P' &&
      nextParagraph.children.length === 1 &&
      nextParagraph.firstElementChild?.tagName === 'EM'
    ) {
      caption = nextParagraph.textContent?.trim() || caption;
      nextParagraph.remove();
    }

    let figureId = figureIdFromImage(image, index + 1);
    let suffix = 2;
    while (usedIds.has(figureId)) {
      figureId = `${figureIdFromImage(image, index + 1)}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(figureId);

    const figure = document.createElement('figure');
    figure.className = 'post-figure';
    figure.id = figureId;

    const figcaption = document.createElement('figcaption');
    figcaption.id = `${figureId}-caption`;

    const anchor = document.createElement('a');
    anchor.className = 'figure-anchor';
    anchor.href = `#${figureId}`;
    anchor.textContent = `Abbildung ${index + 1}`;

    figcaption.append(anchor, document.createTextNode(`: ${caption}`));
    image.setAttribute('aria-describedby', figcaption.id);

    imageParagraph.replaceWith(figure);
    figure.append(image, figcaption);
  });
}

observeRevealItems();
loadPosts();
setupPostFigures();

function setupTerminalFocusMode() {
  const terminal = document.querySelector('.terminal-post');
  const actionButtons = document.querySelectorAll('[data-terminal-action]');

  if (!terminal || !actionButtons.length) {
    return;
  }

  const setState = (mode) => {
    const isMaximized = mode === 'maximized';
    const isMinimized = mode === 'minimized';

    terminal.classList.toggle('is-maximized', isMaximized);
    terminal.classList.toggle('is-minimized', isMinimized);
    document.body.classList.toggle('terminal-focus', isMaximized);

    actionButtons.forEach((button) => {
      const action = button.dataset.terminalAction;
      button.setAttribute('aria-pressed', String(
        (action === 'maximize' && isMaximized) ||
          (action === 'minimize' && isMinimized) ||
          (action === 'restore' && !isMaximized && !isMinimized)
      ));
    });
  };

  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.terminalAction;

      if (action === 'maximize') {
        setState('maximized');
        return;
      }

      if (action === 'overview') {
        window.location.href = '/#posts';
        return;
      }

      if (action === 'minimize') {
        setState('minimized');
        return;
      }

      setState('restored');
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && terminal.classList.contains('is-maximized')) {
      setState('restored');
    }
  });

  setState('restored');
}

setupTerminalFocusMode();

const SNIPPET_HIGHLIGHT_VERSION = '11.11.1';

function ensureSnippetStyles() {
  if (!document.querySelector('link[data-snippet-styles]')) {
    const localStyles = document.createElement('link');
    localStyles.rel = 'stylesheet';
    localStyles.href = '/assets/css/snippets.css';
    localStyles.dataset.snippetStyles = '';
    document.head.append(localStyles);
  }

  if (!document.querySelector('link[data-highlight-styles]')) {
    const highlightStyles = document.createElement('link');
    highlightStyles.rel = 'stylesheet';
    highlightStyles.href = `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/styles/github-dark.min.css`;
    highlightStyles.dataset.highlightStyles = '';
    document.head.append(highlightStyles);
  }
}

function ensureHighlightJs() {
  if (window.hljs) {
    return Promise.resolve(window.hljs);
  }

  const existing = document.querySelector('script[data-highlight-js]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.hljs), { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/highlight.min.js`;
    script.dataset.highlightJs = '';
    script.addEventListener('load', () => resolve(window.hljs), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
}

function parseSnippetReference(link) {
  const title = link.getAttribute('title') || '';
  if (!title.startsWith('snippet:')) {
    return null;
  }

  const [, language = '', range = ''] = title.split(':');
  const href = link.getAttribute('href') || '';
  if (!href.startsWith('/snippets/') || href.includes('..')) {
    return null;
  }

  return {
    title: link.textContent?.trim() || href.split('/').pop(),
    language,
    range,
    href
  };
}

function sliceSnippet(source, range) {
  const match = String(range || '').match(/^(\d+)-(\d+)$/);
  if (!match) {
    return source;
  }

  const start = Math.max(1, Number.parseInt(match[1], 10));
  const end = Math.max(start, Number.parseInt(match[2], 10));
  return source.split(/\r?\n/).slice(start - 1, end).join('\n');
}

function renderSnippetEmbed(link, reference) {
  const figure = document.createElement('figure');
  figure.className = 'code-snippet';

  const header = document.createElement('header');
  header.className = 'code-snippet__header';

  const titleBox = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'code-snippet__title';
  title.textContent = reference.title;
  const meta = document.createElement('span');
  meta.className = 'code-snippet__meta';
  meta.textContent = [reference.language, reference.range ? `Zeilen ${reference.range}` : ''].filter(Boolean).join(' · ');
  titleBox.append(title, meta);

  const headerActions = document.createElement('div');
  headerActions.className = 'code-snippet__actions';
  const download = document.createElement('a');
  download.className = 'code-snippet__download';
  download.href = reference.href;
  download.download = '';
  download.textContent = 'Download';
  headerActions.append(download);
  header.append(titleBox, headerActions);

  const details = document.createElement('details');
  details.className = 'code-snippet__details';

  const summary = document.createElement('summary');
  summary.className = 'code-snippet__summary';
  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = 'Code anzeigen';
  summary.append(toggleLabel);

  const body = document.createElement('div');
  body.className = 'code-snippet__body';

  const toolbar = document.createElement('div');
  toolbar.className = 'code-snippet__toolbar';
  const copy = document.createElement('button');
  copy.className = 'code-snippet__copy';
  copy.type = 'button';
  copy.textContent = 'Kopieren';
  copy.disabled = true;
  toolbar.append(copy);

  const loading = document.createElement('p');
  loading.className = 'code-snippet__loading';
  loading.textContent = 'Code wird geladen ...';

  const pre = document.createElement('pre');
  pre.hidden = true;
  const code = document.createElement('code');
  code.className = `hljs${reference.language ? ` language-${reference.language}` : ''}`;
  pre.append(code);

  const footer = document.createElement('footer');
  footer.className = 'code-snippet__footer';
  const full = document.createElement('a');
  full.href = `/snippets/#/${encodeURIComponent(reference.href.replace(/^\/snippets\//, ''))}`;
  full.textContent = 'Vollständigen Code anzeigen';
  footer.append(full);

  body.append(toolbar, loading, pre, footer);
  details.append(summary, body);
  figure.append(header, details);

  const paragraph = link.parentElement?.tagName === 'P' && link.parentElement.children.length === 1
    ? link.parentElement
    : null;
  (paragraph || link).replaceWith(figure);

  let source = '';
  let loaded = false;
  let loadingSource = false;

  copy.addEventListener('click', async () => {
    if (!loaded) {
      return;
    }

    await window.navigator.clipboard.writeText(source);
    copy.textContent = 'Kopiert';
    window.setTimeout(() => { copy.textContent = 'Kopieren'; }, 1200);
  });

  const loadSource = async () => {
    if (loaded || loadingSource) {
      return;
    }

    loadingSource = true;
    loading.hidden = false;
    loading.textContent = 'Code wird geladen ...';

    try {
      const [response, highlighter] = await Promise.all([
        fetch(reference.href),
        ensureHighlightJs()
      ]);
      if (!response.ok) {
        throw new Error(`Snippet ${reference.href} konnte nicht geladen werden`);
      }

      const fullSource = await response.text();
      source = sliceSnippet(fullSource, reference.range);
      const highlighted = reference.language && highlighter.getLanguage(reference.language)
        ? highlighter.highlight(source, { language: reference.language }).value
        : highlighter.highlightAuto(source).value;

      code.innerHTML = highlighted;
      pre.hidden = false;
      loading.hidden = true;
      copy.disabled = false;
      loaded = true;
    } catch (error) {
      loading.textContent = 'Code konnte nicht geladen werden.';
      console.error(error);
    } finally {
      loadingSource = false;
    }
  };

  details.addEventListener('toggle', () => {
    toggleLabel.textContent = details.open ? 'Code ausblenden' : 'Code anzeigen';
    if (details.open && !loaded) {
      void loadSource();
    }
  });
}

function setupSnippetEmbeds() {
  const links = [...document.querySelectorAll('.terminal-content a[title^="snippet:"]')];
  if (!links.length) {
    return;
  }

  ensureSnippetStyles();
  links.forEach((link) => {
    const reference = parseSnippetReference(link);
    if (!reference) {
      return;
    }

    renderSnippetEmbed(link, reference);
  });
}

setupSnippetEmbeds();
