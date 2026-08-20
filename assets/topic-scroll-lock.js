/* global document, window, MutationObserver */

(() => {
  const topicsList = document.getElementById('topics-list');
  if (!topicsList) {
    return;
  }

  const sectionHeading = topicsList.previousElementSibling;
  if (sectionHeading?.tagName === 'H2') {
    sectionHeading.remove();
  }

  topicsList.classList.remove('topic-grid');
  topicsList.classList.add('topic-filter-groups');

  const createGroup = (title, buttons) => {
    if (!buttons.length) {
      return null;
    }

    const group = document.createElement('div');
    group.className = 'topic-group';

    const heading = document.createElement('h2');
    heading.className = 'topic-group-title';
    heading.textContent = title;

    const grid = document.createElement('div');
    grid.className = 'topic-grid';
    buttons.forEach((button) => grid.append(button));

    group.append(heading, grid);
    return group;
  };

  const groupTopics = () => {
    const buttons = [...topicsList.querySelectorAll(':scope > .topic')];
    if (!buttons.length) {
      return;
    }

    observer.disconnect();

    const all = buttons.filter((button) => button.dataset.topic === 'all');
    const tags = buttons.filter((button) => button.dataset.topic?.startsWith('tag:'));
    const categories = buttons.filter((button) => button.dataset.topic?.startsWith('category:'));

    const tagsGroup = createGroup('Tags', [...all, ...tags]);
    const categoriesGroup = createGroup('Themenfelder', categories);

    topicsList.replaceChildren(...[tagsGroup, categoriesGroup].filter(Boolean));
    observer.observe(topicsList, { childList: true });
  };

  const observer = new MutationObserver(groupTopics);
  observer.observe(topicsList, { childList: true });
  groupTopics();

  topicsList.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-topic]');
      if (!button) {
        return;
      }

      const topBeforeRender = topicsList.getBoundingClientRect().top;

      window.requestAnimationFrame(() => {
        const topAfterRender = topicsList.getBoundingClientRect().top;
        const offset = topAfterRender - topBeforeRender;

        if (Math.abs(offset) > 0.5) {
          window.scrollBy(0, offset);
        }
      });
    },
    true
  );
})();
