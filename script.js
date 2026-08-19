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

const MAX_VISIBLE_TAGS = 2;

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

observeRevealItems();
loadPosts();

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
