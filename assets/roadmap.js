(() => {
  const root = document.querySelector('#roadmap-content');
  if (!root) {
    return;
  }

  function milestoneNumber(title, fallback) {
    const match = String(title || '').match(/Meilenstein\s+(\d+)/i);
    return match ? match[1] : String(fallback);
  }

  function buildDetailCard(titleNode, contentNodes, index) {
    const card = document.createElement('section');
    card.className = `roadmap-detail-card roadmap-detail-card--tone-${(index % 5) + 1}`;
    card.append(titleNode, ...contentNodes);
    return card;
  }

  function buildMilestone(nodes, index) {
    const heading = nodes.shift();
    const milestone = document.createElement('section');
    milestone.className = `roadmap-milestone roadmap-milestone--tone-${(index % 4) + 1}`;

    const header = document.createElement('header');
    header.className = 'roadmap-milestone__header';

    const number = document.createElement('span');
    number.className = 'roadmap-milestone__number';
    number.textContent = milestoneNumber(heading.textContent, index + 1);

    heading.classList.add('roadmap-milestone__title');
    header.append(number, heading);

    const summary = document.createElement('div');
    summary.className = 'roadmap-milestone__summary';

    const details = document.createElement('div');
    details.className = 'roadmap-detail-grid';

    let currentTitle = null;
    let currentNodes = [];
    let detailIndex = 0;

    function flushDetail() {
      if (!currentTitle) {
        return;
      }
      details.append(buildDetailCard(currentTitle, currentNodes, detailIndex));
      detailIndex += 1;
      currentTitle = null;
      currentNodes = [];
    }

    nodes.forEach((node) => {
      if (node.tagName === 'H3') {
        flushDetail();
        currentTitle = node;
        return;
      }

      if (currentTitle) {
        currentNodes.push(node);
      } else if (node.tagName !== 'HR') {
        summary.append(node);
      }
    });
    flushDetail();

    milestone.append(header);
    if (summary.childNodes.length) {
      milestone.append(summary);
    }
    if (details.childNodes.length) {
      milestone.append(details);
    }

    return milestone;
  }

  function enhanceRoadmap() {
    const children = [...root.children];
    const title = children.shift();
    if (!title || title.tagName !== 'H1') {
      return;
    }

    const introNodes = [];
    while (children.length && children[0].tagName !== 'H2') {
      const node = children.shift();
      if (node.tagName !== 'HR') {
        introNodes.push(node);
      }
    }

    const hero = document.createElement('header');
    hero.className = 'roadmap-hero';
    title.classList.add('roadmap-hero__title');

    const intro = document.createElement('div');
    intro.className = 'roadmap-hero__intro';
    intro.append(...introNodes);

    const note = document.createElement('aside');
    note.className = 'roadmap-loop-note';
    note.setAttribute('aria-label', 'Roadmap-Prinzip');
    note.innerHTML = '<strong>Planen → Bauen</strong><span>Verbessern → Wiederholen</span>';

    hero.append(title, intro, note);

    const board = document.createElement('div');
    board.className = 'roadmap-board';

    let milestoneIndex = 0;
    while (children.length) {
      if (children[0].tagName !== 'H2') {
        children.shift();
        continue;
      }

      const milestoneNodes = [children.shift()];
      while (children.length && children[0].tagName !== 'H2') {
        milestoneNodes.push(children.shift());
      }

      if (milestoneIndex > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'roadmap-flow-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↓';
        board.append(arrow);
      }

      board.append(buildMilestone(milestoneNodes, milestoneIndex));
      milestoneIndex += 1;
    }

    const reminder = document.createElement('div');
    reminder.className = 'roadmap-reminder';
    reminder.innerHTML = '<span>★</span><strong>Aktueller Fokus</strong><span>Meilenstein 1</span>';

    root.replaceChildren(hero, reminder, board);
    root.classList.add('is-enhanced');
  }

  async function renderRoadmap() {
    if (typeof window.markdownit !== 'function') {
      root.innerHTML = '<h1>Roadmap</h1><p>Der Markdown-Renderer konnte nicht geladen werden.</p>';
      root.dataset.roadmapReady = 'error';
      return;
    }

    const renderer = window.markdownit({
      html: false,
      linkify: true,
      typographer: true
    });

    try {
      const response = await fetch('/roadmap.md', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      root.innerHTML = renderer.render(await response.text());
      enhanceRoadmap();
      root.dataset.roadmapReady = 'true';
    } catch (error) {
      root.innerHTML = `<h1>Roadmap</h1><p>Die Roadmap konnte nicht geladen werden: ${error.message}</p>`;
      root.dataset.roadmapReady = 'error';
    }
  }

  renderRoadmap();
})();
