(() => {
  const selector = 'abbr.glossary-term[title]';
  const terms = [...document.querySelectorAll(selector)];
  if (!terms.length) {
    return;
  }

  const seen = new Set();
  let activeTerm = null;
  let hideTimer = null;

  const tooltip = document.createElement('aside');
  tooltip.className = 'glossary-tooltip';
  tooltip.id = 'glossary-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  tooltip.innerHTML = `
    <strong class="glossary-tooltip__term"></strong>
    <span class="glossary-tooltip__full"></span>
    <span class="glossary-tooltip__description"></span>
    <a class="glossary-tooltip__link" href="/glossary">Im Glossar öffnen</a>
  `;
  document.body.append(tooltip);

  const termNode = tooltip.querySelector('.glossary-tooltip__term');
  const fullNode = tooltip.querySelector('.glossary-tooltip__full');
  const descriptionNode = tooltip.querySelector('.glossary-tooltip__description');
  const linkNode = tooltip.querySelector('.glossary-tooltip__link');

  function splitTitle(title) {
    const separator = ' — ';
    const index = title.indexOf(separator);
    if (index < 0) {
      return { full: '', description: title };
    }
    return {
      full: title.slice(0, index).trim(),
      description: title.slice(index + separator.length).trim()
    };
  }

  function scheduleHide() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 120);
  }

  function cancelHide() {
    window.clearTimeout(hideTimer);
  }

  function positionTooltip(term) {
    const termRect = term.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    const gap = 8;

    let left = termRect.left + (termRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

    let top = termRect.top - tooltipRect.height - gap;
    if (top < margin) {
      top = termRect.bottom + gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function show(term) {
    cancelHide();
    const title = term.dataset.glossaryTitle || '';
    const { full, description } = splitTitle(title);
    const key = term.dataset.glossaryKey || term.textContent.trim();
    const slug = term.dataset.glossarySlug || '';

    termNode.textContent = key;
    fullNode.textContent = full;
    fullNode.hidden = !full;
    descriptionNode.textContent = description;
    linkNode.href = slug ? `/glossary#${encodeURIComponent(slug)}` : '/glossary';

    activeTerm = term;
    tooltip.hidden = false;
    term.setAttribute('aria-expanded', 'true');
    positionTooltip(term);
  }

  function hide() {
    cancelHide();
    if (activeTerm) {
      activeTerm.setAttribute('aria-expanded', 'false');
    }
    activeTerm = null;
    tooltip.hidden = true;
  }

  terms.forEach((term) => {
    const title = term.getAttribute('title') || '';
    const key = term.dataset.glossaryKey || term.textContent.trim();

    term.dataset.glossaryTitle = title;
    term.removeAttribute('title');

    if (seen.has(key)) {
      term.classList.add('glossary-term--repeat');
      term.removeAttribute('aria-describedby');
      return;
    }

    seen.add(key);
    term.classList.add('glossary-term--interactive');
    term.tabIndex = 0;
    term.setAttribute('aria-describedby', tooltip.id);
    term.setAttribute('aria-expanded', 'false');

    term.addEventListener('mouseenter', () => show(term));
    term.addEventListener('mouseleave', scheduleHide);
    term.addEventListener('focus', () => show(term));
    term.addEventListener('blur', scheduleHide);
    term.addEventListener('click', (event) => {
      event.preventDefault();
      if (activeTerm === term && !tooltip.hidden) {
        hide();
        return;
      }
      show(term);
    });
  });

  tooltip.addEventListener('mouseenter', cancelHide);
  tooltip.addEventListener('mouseleave', scheduleHide);
  tooltip.addEventListener('focusin', cancelHide);
  tooltip.addEventListener('focusout', scheduleHide);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  });

  document.addEventListener('click', (event) => {
    if (tooltip.hidden || !activeTerm) {
      return;
    }
    if (activeTerm.contains(event.target) || tooltip.contains(event.target)) {
      return;
    }
    hide();
  });

  window.addEventListener('resize', () => {
    if (activeTerm && !tooltip.hidden) {
      positionTooltip(activeTerm);
    }
  });

  window.addEventListener('scroll', () => {
    if (activeTerm && !tooltip.hidden) {
      positionTooltip(activeTerm);
    }
  }, { passive: true });
})();
