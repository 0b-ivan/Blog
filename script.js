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
      return `
        <article class="post-card reveal" data-delay="${delay}">
          <p class="meta">${meta}</p>
          <h3>${post.title}</h3>
          <p>${post.excerpt}</p>
          <a href="/posts/${post.slug}" class="read-more">Artikel lesen</a>
        </article>
      `;
    })
    .join('');

  observeRevealItems(list);
}

function getTopics(posts) {
  const unique = new Set(
    posts
      .map((post) => (post.category || 'IT').trim())
      .filter(Boolean)
  );

  return ['Alle', ...[...unique].sort((a, b) => a.localeCompare(b, 'de'))];
}

function renderTopics(posts, activeTopic) {
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
      const isActive = name === activeTopic;
      return `
        <button
          class="topic reveal ${isActive ? 'is-active' : ''}"
          data-delay="${delay}"
          data-topic="${name}"
          type="button"
        >${name}</button>
      `;
    })
    .join('');

  observeRevealItems(list);
}

function filterPostsByTopic(posts, activeTopic) {
  if (!activeTopic || activeTopic === 'Alle') {
    return posts;
  }

  return posts.filter((post) => (post.category || 'IT').trim() === activeTopic);
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
    let activeTopic = 'Alle';

    const applyView = () => {
      const visiblePosts = filterPostsByTopic(posts, activeTopic);
      renderPosts(visiblePosts);
      renderTopics(posts, activeTopic);
    };

    topicsList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-topic]');
      if (!button) {
        return;
      }

      activeTopic = button.dataset.topic || 'Alle';
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
  const toggleButton = document.querySelector('[data-terminal-toggle]');
  const terminal = document.querySelector('.terminal-post');

  if (!toggleButton || !terminal) {
    return;
  }

  const setState = (isMaximized) => {
    terminal.classList.toggle('is-maximized', isMaximized);
    document.body.classList.toggle('terminal-focus', isMaximized);
    toggleButton.setAttribute('aria-pressed', String(isMaximized));
    toggleButton.textContent = isMaximized ? 'Exit focus' : 'Maximize';
  };

  toggleButton.addEventListener('click', () => {
    const isMaximized = terminal.classList.contains('is-maximized');
    setState(!isMaximized);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && terminal.classList.contains('is-maximized')) {
      setState(false);
    }
  });
}

setupTerminalFocusMode();
