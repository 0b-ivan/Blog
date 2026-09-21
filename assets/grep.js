(() => {
  const DEBOUNCE_MS = 220;
  const form = document.querySelector('#grep-form');
  const input = document.querySelector('#grep-query');
  const clearButton = document.querySelector('#grep-clear');
  const status = document.querySelector('#grep-status');
  const resultsRoot = document.querySelector('#grep-results');

  if (!form || !input || !clearButton || !status || !resultsRoot) {
    return;
  }

  let debounceTimer = null;
  let activeController = null;
  let requestSequence = 0;

  function setStatus(message, state = 'idle') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearResults() {
    resultsRoot.replaceChildren();
  }

  function syncClearButton() {
    clearButton.hidden = input.value.length === 0;
  }

  function metaPart(value) {
    const span = document.createElement('span');
    span.textContent = value;
    return span;
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
        source: 'grep-page'
      }),
      keepalive: true
    }).catch(() => {});
  }

  function renderResult(result, index, query) {
    const article = document.createElement('article');
    article.className = 'grep-result';

    const position = document.createElement('span');
    position.className = 'grep-result__position';
    position.textContent = String(index + 1).padStart(2, '0');

    const body = document.createElement('div');
    body.className = 'grep-result__body';

    const overline = document.createElement('div');
    overline.className = 'grep-result__overline';
    overline.append(metaPart('ARTICLE'));
    if (result.category) {
      overline.append(metaPart(result.category));
    }

    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = result.url || `/posts/${result.slug}`;
    link.textContent = result.title || result.slug || 'Artikel';
    link.addEventListener('click', () => trackSearchClick(query, result, index));
    heading.append(link);

    const preview = document.createElement('p');
    preview.className = 'grep-result__preview';
    preview.textContent = result.content || result.excerpt || '';

    const meta = document.createElement('div');
    meta.className = 'grep-result__meta';
    if (result.heading) {
      meta.append(metaPart(`# ${result.heading}`));
    }
    if (Array.isArray(result.tags) && result.tags.length > 0) {
      meta.append(metaPart(result.tags.slice(0, 6).map((tag) => `#${tag}`).join(' ')));
    }

    body.append(overline, heading, preview, meta);
    article.append(position, body);
    return article;
  }

  function renderResults(results, query) {
    clearResults();
    if (!Array.isArray(results) || results.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'grep-empty';
      empty.textContent = 'Keine relevanten Artikel gefunden.';
      resultsRoot.append(empty);
      return;
    }

    resultsRoot.append(...results.map((result, index) => renderResult(result, index, query)));
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
      return;
    }

    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;
    const sequence = ++requestSequence;
    const startedAt = window.performance.now();
    setStatus(`Suche nach „${normalized}“ …`, 'loading');

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: normalized, limit: 8, source: 'grep-page' }),
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (sequence !== requestSequence) {
        return;
      }

      const elapsed = Math.round(window.performance.now() - startedAt);
      const results = Array.isArray(payload.results) ? payload.results : [];
      renderResults(results, normalized);
      setStatus(
        results.length === 0
          ? `Keine relevanten Treffer · ${elapsed} ms`
          : `${results.length} Treffer · ${elapsed} ms`,
        'success'
      );
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      if (sequence === requestSequence) {
        setStatus(`Suche nicht verfügbar: ${error.message}`, 'error');
      }
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function scheduleSearch(value, immediate = false) {
    const normalized = String(value || '').trim();
    syncClearButton();

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (normalized.length < 2) {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      requestSequence += 1;
      clearResults();
      setStatus(normalized.length === 0 ? 'Tippe mindestens zwei Zeichen.' : 'Noch ein Zeichen …', 'idle');
      return;
    }

    setStatus(`Suche nach „${normalized}“ …`, 'loading');
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      search(normalized);
    }, immediate ? 0 : DEBOUNCE_MS);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    scheduleSearch(input.value, true);
  });

  input.addEventListener('input', () => {
    scheduleSearch(input.value);
  });

  clearButton.addEventListener('click', () => {
    stopPendingSearch();
    requestSequence += 1;
    input.value = '';
    syncClearButton();
    clearResults();
    setStatus('Tippe mindestens zwei Zeichen.', 'idle');
    input.focus();
  });

  document.querySelectorAll('[data-grep-query]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.grepQuery || '';
      input.focus();
      scheduleSearch(input.value, true);
    });
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (
      target.matches('input, textarea, select') || target.isContentEditable
    );

    if (event.key === '/' && !isTyping) {
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }

    if (event.key === 'Escape' && document.activeElement === input) {
      clearButton.click();
    }
  });

  syncClearButton();
  input.focus({ preventScroll: true });
})();
