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

function renderTopics(posts) {
  const list = document.getElementById('topics-list');
  if (!list) {
    return;
  }

  const counts = posts.reduce((acc, post) => {
    const category = (post.category || 'IT').trim();
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const topics = Object.entries(counts)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0], 'de');
    });

  if (!topics.length) {
    list.innerHTML = '<p>Noch keine Themen vorhanden.</p>';
    return;
  }

  list.innerHTML = topics
    .map(([name, count], index) => {
      const delay = 180 + index * 40;
      return `<div class="topic reveal" data-delay="${delay}">${name} (${count})</div>`;
    })
    .join('');

  observeRevealItems(list);
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
    renderPosts(posts);
    renderTopics(posts);
  } catch (_error) {
    postsList.innerHTML = '<p>Artikel konnten gerade nicht geladen werden.</p>';
    topicsList.innerHTML = '<p>Themen konnten gerade nicht geladen werden.</p>';
  }
}

observeRevealItems();
loadPosts();
