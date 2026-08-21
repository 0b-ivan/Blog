(() => {
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

  upgradeTagChips();

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