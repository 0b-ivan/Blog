(() => {
  const PRIMARY_NAVIGATION = [
    ['Artikel', '/#posts'],
    ['Themen', '/#topics'],
    ['Snippets', '/snippets/'],
    ['Glossar', '/glossary'],
    ['Wissensnetz', '/knowledge'],
    ['Archiv', '/archive']
  ];

  function tagHref(label) {
    return `/tags/${encodeURIComponent(String(label || '').trim())}`;
  }

  function upgradeTagChip(chip) {
    if (!chip || chip.tagName === 'A' || chip.dataset.tagLinkUpgraded === 'true') {
      return;
    }

    const label = chip.textContent?.trim();
    if (!label) {
      return;
    }

    const link = document.createElement('a');
    link.className = chip.className;
    link.href = tagHref(label);
    link.textContent = label;
    link.dataset.tagLinkUpgraded = 'true';
    link.setAttribute('aria-label', `Artikel mit Tag ${label} anzeigen`);

    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    chip.replaceWith(link);
  }

  function upgradeTagChips(root = document) {
    root.querySelectorAll?.('.tag-chip').forEach(upgradeTagChip);
  }

  function isCurrentNavigation(href) {
    const path = window.location.pathname.replace(/\/$/, '') || '/';

    if (href === '/snippets/') {
      return path === '/snippets';
    }

    return !href.includes('#') && path === href;
  }

  function ensurePrimaryNavigation() {
    const nav = document.querySelector('.main-nav');
    if (!nav) {
      return;
    }

    const links = PRIMARY_NAVIGATION.map(([label, href]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (isCurrentNavigation(href)) {
        link.setAttribute('aria-current', 'page');
      }
      return link;
    });

    nav.querySelectorAll('a').forEach((link) => link.remove());
    nav.prepend(...links);
  }

  function loadKnowledgeNetwork() {
    if (window.location.pathname !== '/knowledge') {
      return;
    }

    if (document.querySelector('script[data-knowledge-network]')) {
      return;
    }

    const script = document.createElement('script');
    script.src = '/assets/knowledge-network.js';
    script.defer = true;
    script.dataset.knowledgeNetwork = 'true';
    document.body.append(script);
  }

  function loadKnowledgeGraph() {
    if (!document.querySelector('.post-page .terminal-post')) {
      return;
    }

    if (window.location.pathname.startsWith('/history/')) {
      return;
    }

    if (document.querySelector('script[data-knowledge-graph]')) {
      return;
    }

    const script = document.createElement('script');
    script.src = '/assets/knowledge-graph.js';
    script.defer = true;
    script.dataset.knowledgeGraph = 'true';
    document.body.append(script);
  }

  upgradeTagChips();
  ensurePrimaryNavigation();
  loadKnowledgeNetwork();
  loadKnowledgeGraph();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (node.matches('.tag-chip')) {
          upgradeTagChip(node);
        }
        upgradeTagChips(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
