/* global document, MutationObserver */

(() => {
  const list = document.getElementById('topics-list');
  if (!list) {
    return;
  }

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
    const buttons = [...list.querySelectorAll(':scope > .topic')];
    if (!buttons.length) {
      return;
    }

    observer.disconnect();

    const all = buttons.filter((button) => button.dataset.topic === 'all');
    const tags = buttons.filter((button) => button.dataset.topic?.startsWith('tag:'));
    const categories = buttons.filter((button) => button.dataset.topic?.startsWith('category:'));

    const tagsGroup = createGroup('Tags', [...all, ...tags]);
    const categoriesGroup = createGroup('Themenfelder', categories);

    list.replaceChildren(...[tagsGroup, categoriesGroup].filter(Boolean));
    observer.observe(list, { childList: true });
  };

  const observer = new MutationObserver(groupTopics);
  observer.observe(list, { childList: true });
  groupTopics();
})();
