/* global document, fetch, MutationObserver */

(() => {
  const topicsSection = document.getElementById('topics');
  const topicsList = document.getElementById('topics-list');
  const postsList = document.getElementById('posts-list');
  if (!topicsSection || !topicsList || !postsList) {
    return;
  }

  const state = {
    mode: 'tags',
    query: '',
    expanded: false,
    buttons: [],
    counts: new Map(),
    totalPosts: 0
  };

  const sectionHeading = topicsList.previousElementSibling;
  if (sectionHeading?.tagName === 'H2') {
    sectionHeading.textContent = 'Tags & Themen';
  }

  const header = document.createElement('div');
  header.className = 'topic-browser-head';

  if (sectionHeading?.tagName === 'H2') {
    header.append(sectionHeading);
  }

  const controls = document.createElement('div');
  controls.className = 'topic-browser-controls';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'topic-filter-label';
  filterLabel.textContent = 'FILTERN NACH';

  const tabs = document.createElement('div');
  tabs.className = 'topic-mode-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Filtertyp');

  const tagsTab = document.createElement('button');
  tagsTab.className = 'topic-mode-button is-active';
  tagsTab.type = 'button';
  tagsTab.dataset.topicMode = 'tags';
  tagsTab.textContent = 'Tags';
  tagsTab.setAttribute('aria-pressed', 'true');

  const categoriesTab = document.createElement('button');
  categoriesTab.className = 'topic-mode-button';
  categoriesTab.type = 'button';
  categoriesTab.dataset.topicMode = 'categories';
  categoriesTab.textContent = 'Themen';
  categoriesTab.setAttribute('aria-pressed', 'false');

  tabs.append(tagsTab, categoriesTab);
  controls.append(filterLabel, tabs);

  const searchRow = document.createElement('div');
  searchRow.className = 'topic-search-row';

  const searchWrap = document.createElement('label');
  searchWrap.className = 'topic-search';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'topic-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.textContent = '⌕';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  searchInput.placeholder = 'Tag suchen …';
  searchInput.setAttribute('aria-label', 'Tag suchen');

  searchWrap.append(searchIcon, searchInput);

  const resultCount = document.createElement('p');
  resultCount.className = 'topic-result-count';
  resultCount.setAttribute('aria-live', 'polite');
  resultCount.textContent = 'Artikel werden geladen …';

  searchRow.append(searchWrap, resultCount);

  const showMore = document.createElement('button');
  showMore.className = 'topic-show-more';
  showMore.type = 'button';
  showMore.hidden = true;

  topicsList.classList.remove('topic-filter-groups');
  topicsList.classList.add('topic-grid');

  topicsSection.insertBefore(header, topicsList);
  topicsSection.insertBefore(controls, topicsList);
  topicsSection.insertBefore(searchRow, topicsList);
  topicsSection.insertBefore(showMore, topicsList.nextSibling);

  const topicLabel = (topic) => {
    if (topic === 'all') {
      return 'Alle';
    }
    if (topic.startsWith('tag:')) {
      return topic.slice(4);
    }
    if (topic.startsWith('category:')) {
      return topic.slice(9);
    }
    return topic;
  };

  const updateResultCount = () => {
    const count = postsList.querySelectorAll('.post-card').length;
    resultCount.textContent = `${count} Artikel`;
  };

  const updateTabs = () => {
    const isTags = state.mode === 'tags';
    tagsTab.classList.toggle('is-active', isTags);
    categoriesTab.classList.toggle('is-active', !isTags);
    tagsTab.setAttribute('aria-pressed', String(isTags));
    categoriesTab.setAttribute('aria-pressed', String(!isTags));

    searchInput.placeholder = isTags ? 'Tag suchen …' : 'Thema suchen …';
    searchInput.setAttribute('aria-label', isTags ? 'Tag suchen' : 'Thema suchen');
  };

  const decorateButton = (button) => {
    const topic = button.dataset.topic || '';
    const label = topicLabel(topic);
    const count = topic === 'all' ? state.totalPosts : state.counts.get(topic) || 0;

    button.textContent = label;

    const countNode = document.createElement('span');
    countNode.className = 'topic-count';
    countNode.textContent = `[${count}]`;
    button.append(countNode);
  };

  const renderButtons = () => {
    if (!state.buttons.length) {
      return;
    }

    listObserver.disconnect();

    const allButton = state.buttons.find((button) => button.dataset.topic === 'all');
    const prefix = state.mode === 'tags' ? 'tag:' : 'category:';
    const normalizedQuery = state.query.trim().toLocaleLowerCase('de');

    const matching = state.buttons
      .filter((button) => button.dataset.topic?.startsWith(prefix))
      .filter((button) => topicLabel(button.dataset.topic || '').toLocaleLowerCase('de').includes(normalizedQuery))
      .sort((left, right) => {
        const leftCount = state.counts.get(left.dataset.topic || '') || 0;
        const rightCount = state.counts.get(right.dataset.topic || '') || 0;
        if (leftCount !== rightCount) {
          return rightCount - leftCount;
        }
        return topicLabel(left.dataset.topic || '').localeCompare(topicLabel(right.dataset.topic || ''), 'de');
      });

    const limit = state.mode === 'tags' && !state.expanded && !normalizedQuery ? 8 : matching.length;
    const visible = matching.slice(0, limit);
    const buttons = allButton ? [allButton, ...visible] : visible;

    buttons.forEach(decorateButton);
    topicsList.replaceChildren(...buttons);

    const totalForMode = state.buttons.filter((button) => button.dataset.topic?.startsWith(prefix)).length;
    const canExpand = state.mode === 'tags' && !normalizedQuery && totalForMode > 8;
    showMore.hidden = !canExpand;
    showMore.textContent = state.expanded
      ? 'weniger Tags anzeigen ↑'
      : `alle ${totalForMode} Tags anzeigen ↓`;

    listObserver.observe(topicsList, { childList: true });
  };

  const collectButtons = () => {
    const directButtons = [...topicsList.querySelectorAll(':scope > .topic')];
    if (!directButtons.length) {
      return;
    }

    state.buttons = directButtons;
    renderButtons();
  };

  const listObserver = new MutationObserver(collectButtons);
  listObserver.observe(topicsList, { childList: true });

  const postsObserver = new MutationObserver(updateResultCount);
  postsObserver.observe(postsList, { childList: true });

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-topic-mode]');
    if (!button) {
      return;
    }

    state.mode = button.dataset.topicMode === 'categories' ? 'categories' : 'tags';
    state.query = '';
    state.expanded = false;
    searchInput.value = '';
    updateTabs();
    renderButtons();
  });

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    renderButtons();
  });

  showMore.addEventListener('click', () => {
    state.expanded = !state.expanded;
    renderButtons();
  });

  fetch('/api/posts')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Cannot load topic counts');
      }
      return response.json();
    })
    .then((posts) => {
      state.totalPosts = posts.length;

      posts.forEach((post) => {
        const category = String(post.category || 'IT').trim();
        if (category) {
          const key = `category:${category}`;
          state.counts.set(key, (state.counts.get(key) || 0) + 1);
        }

        const tags = Array.isArray(post.tags) ? new Set(post.tags.map((tag) => String(tag).trim()).filter(Boolean)) : new Set();
        tags.forEach((tag) => {
          const key = `tag:${tag}`;
          state.counts.set(key, (state.counts.get(key) || 0) + 1);
        });
      });

      renderButtons();
      updateResultCount();
    })
    .catch(() => {
      updateResultCount();
    });

  updateTabs();
  collectButtons();
  updateResultCount();
})();
