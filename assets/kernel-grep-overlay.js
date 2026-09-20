(() => {
  const DEBOUNCE_MS = 180;
  const triggers = [...document.querySelectorAll('[data-kernel-grep-trigger]')];
  let overlay = null;
  let input = null;
  let output = null;
  let status = null;
  let debounceTimer = null;
  let activeController = null;
  let requestSequence = 0;
  let previousFocus = null;

  function isTypingTarget(target) {
    return target instanceof HTMLElement && (
      target.matches('input, textarea, select') || target.isContentEditable
    );
  }

  function appendLine(root, text, className = '') {
    const line = document.createElement('div');
    line.className = `kernel-grep-console__line ${className}`.trim();
    line.textContent = text;
    root.append(line);
    return line;
  }

  function renderIdle() {
    output.replaceChildren();
    appendLine(output, 'kernel-grep ready', 'kernel-grep-console__line--muted');
    appendLine(output, 'type a query; results stream in automatically', 'kernel-grep-console__line--muted');
    status.textContent = 'bereit';
    status.dataset.state = 'idle';
  }

  function renderLoading(query) {
    output.replaceChildren();
    appendLine(output, `$ grep --semantic "${query}" posts/`, 'kernel-grep-console__line--command');
    appendLine(output, 'searching semantic index …', 'kernel-grep-console__line--muted');
    status.textContent = 'suche …';
    status.dataset.state = 'loading';
  }

  function renderEmpty(query) {
    output.replaceChildren();
    appendLine(output, `$ grep --semantic "${query}" posts/`, 'kernel-grep-console__line--command');
    appendLine(output, '0 matches', 'kernel-grep-console__line--muted');
    appendLine(output, 'grep: keine passenden Kernel Notes gefunden', 'kernel-grep-console__line--warning');
    status.textContent = '0 treffer';
    status.dataset.state = 'success';
  }

  function trackSearchClick(query, result, index) {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        type: 'search_click',
        query,
        slug: result.slug || '',
        rank: index + 1,
        source: 'grep-overlay'
      }),
      keepalive: true
    }).catch(() => {});
  }

  function resultLine(result, index, query) {
    const link = document.createElement('a');
    link.className = 'kernel-grep-console__result';
    link.href = result.url || `/posts/${result.slug}`;
    link.addEventListener('click', () => trackSearchClick(query, result, index));

    const pathLine = document.createElement('div');
    pathLine.className = 'kernel-grep-console__result-path';
    const location = result.heading ? `#${String(result.heading).replace(/\s+/g, '-')}` : '';
    pathLine.textContent = `[${String(index + 1).padStart(2, '0')}] ./posts/${result.slug}${location}`;

    const titleLine = document.createElement('div');
    titleLine.className = 'kernel-grep-console__result-title';
    titleLine.textContent = `> ${result.title || result.slug || 'Artikel'}`;

    const contextLine = document.createElement('div');
    contextLine.className = 'kernel-grep-console__result-context';
    const context = String(result.content || result.excerpt || '').replace(/\s+/g, ' ').trim();
    contextLine.textContent = context.length > 220 ? `${context.slice(0, 219).trimEnd()}…` : context;

    const metaLine = document.createElement('div');
    metaLine.className = 'kernel-grep-console__result-meta';
    const meta = [result.category, ...(Array.isArray(result.tags) ? result.tags.slice(0, 5).map((tag) => `#${tag}`) : [])]
      .filter(Boolean)
      .join('  ');
    metaLine.textContent = meta;

    link.append(pathLine, titleLine, contextLine);
    if (meta) {
      link.append(metaLine);
    }
    return link;
  }

  function renderResults(query, results, elapsed) {
    if (!Array.isArray(results) || results.length === 0) {
      renderEmpty(query);
      return;
    }

    output.replaceChildren();
    appendLine(output, `$ grep --semantic "${query}" posts/`, 'kernel-grep-console__line--command');
    appendLine(output, `${results.length} match${results.length === 1 ? '' : 'es'} · ${elapsed} ms`, 'kernel-grep-console__line--muted');
    const resultRoot = document.createElement('div');
    resultRoot.className = 'kernel-grep-console__results';
    resultRoot.append(...results.map((result, index) => resultLine(result, index, query)));
    output.append(resultRoot);
    status.textContent = `${results.length} treffer`;
    status.dataset.state = 'success';
  }

  function renderError(message) {
    output.replaceChildren();
    appendLine(output, `grep: ${message}`, 'kernel-grep-console__line--error');
    status.textContent = 'fehler';
    status.dataset.state = 'error';
  }

  function stopPendingSearch() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  async function search(query) {
    const normalized = String(query || '').trim();
    if (normalized.length < 2) {
      renderIdle();
      return;
    }

    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;
    const sequence = ++requestSequence;
    const startedAt = window.performance.now();
    renderLoading(normalized);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: normalized, limit: 6, source: 'grep-overlay' }),
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (sequence !== requestSequence) {
        return;
      }
      renderResults(normalized, payload.results, Math.round(window.performance.now() - startedAt));
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      if (sequence === requestSequence) {
        renderError(error.message || 'Suche nicht verfügbar');
      }
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function scheduleSearch(value, immediate = false) {
    const normalized = String(value || '').trim();
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (normalized.length < 2) {
      stopPendingSearch();
      requestSequence += 1;
      renderIdle();
      return;
    }

    renderLoading(normalized);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      search(normalized);
    }, immediate ? 0 : DEBOUNCE_MS);
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) {
      return;
    }
    stopPendingSearch();
    requestSequence += 1;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kernel-grep-overlay-open');
    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
  }

  function openOverlay() {
    ensureOverlay();
    previousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kernel-grep-overlay-open');
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function buildOverlay() {
    const root = document.createElement('div');
    root.className = 'kernel-grep-overlay';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('section');
    dialog.className = 'kernel-grep-console';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Kernel Grep');

    const chrome = document.createElement('header');
    chrome.className = 'kernel-grep-console__chrome';

    const dots = document.createElement('span');
    dots.className = 'kernel-grep-console__dots';
    dots.setAttribute('aria-hidden', 'true');
    ['red', 'yellow', 'green'].forEach((tone) => {
      const dot = document.createElement('span');
      dot.dataset.tone = tone;
      dots.append(dot);
    });

    const title = document.createElement('a');
    title.className = 'kernel-grep-console__title';
    title.href = '/grep';
    title.textContent = 'grep://kernel-notes';

    const close = document.createElement('button');
    close.className = 'kernel-grep-console__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Kernel Grep schließen');
    close.textContent = 'esc';
    close.addEventListener('click', closeOverlay);

    chrome.append(dots, title, close);

    const form = document.createElement('form');
    form.className = 'kernel-grep-console__form';
    form.setAttribute('role', 'search');

    const prompt = document.createElement('span');
    prompt.className = 'kernel-grep-console__prompt';
    prompt.textContent = '$';
    prompt.setAttribute('aria-hidden', 'true');

    const field = document.createElement('input');
    field.className = 'kernel-grep-console__input';
    field.type = 'search';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.maxLength = 300;
    field.placeholder = 'grep nach Docker, RSS, SSM …';
    field.setAttribute('aria-label', 'Kernel Notes durchsuchen');

    const state = document.createElement('span');
    state.className = 'kernel-grep-console__status';
    state.dataset.state = 'idle';
    state.setAttribute('aria-live', 'polite');
    state.textContent = 'bereit';

    form.append(prompt, field, state);

    const resultOutput = document.createElement('div');
    resultOutput.className = 'kernel-grep-console__output';
    resultOutput.setAttribute('aria-live', 'polite');

    const footer = document.createElement('footer');
    footer.className = 'kernel-grep-console__footer';
    const hint = document.createElement('span');
    hint.textContent = '⌘K / Ctrl+K · live search';
    const full = document.createElement('a');
    full.href = '/grep';
    full.textContent = 'Vollansicht →';
    footer.append(hint, full);

    dialog.append(chrome, form, resultOutput, footer);
    root.append(dialog);

    root.addEventListener('mousedown', (event) => {
      if (event.target === root) {
        closeOverlay();
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      scheduleSearch(field.value, true);
    });

    field.addEventListener('input', () => scheduleSearch(field.value));

    document.body.append(root);
    overlay = root;
    input = field;
    output = resultOutput;
    status = state;
    renderIdle();
  }

  function ensureOverlay() {
    if (!overlay) {
      buildOverlay();
    }
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openOverlay();
    });
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (overlay && !overlay.hidden) {
        closeOverlay();
      } else {
        openOverlay();
      }
      return;
    }

    if (event.key === 'Escape' && overlay && !overlay.hidden) {
      event.preventDefault();
      closeOverlay();
      return;
    }

    if (event.key === '/' && !isTypingTarget(event.target) && window.location.pathname !== '/grep') {
      event.preventDefault();
      openOverlay();
    }
  });
})();
