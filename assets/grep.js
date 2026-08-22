(() => {
  const form = document.querySelector('#grep-form');
  const input = document.querySelector('#grep-query');
  const status = document.querySelector('#grep-status');
  const resultsRoot = document.querySelector('#grep-results');
  const submit = form?.querySelector('button[type="submit"]');

  if (!form || !input || !status || !resultsRoot || !submit) {
    return;
  }

  function setStatus(message, state = 'idle') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearResults() {
    resultsRoot.replaceChildren();
  }

  function metaPart(value) {
    const span = document.createElement('span');
    span.textContent = value;
    return span;
  }

  function renderResult(result) {
    const article = document.createElement('article');
    article.className = 'grep-result';

    const score = document.createElement('div');
    score.className = 'grep-result__score';
    score.textContent = `${Math.max(0, Number(result.score || 0)) * 100 >= 0 ? (Number(result.score || 0) * 100).toFixed(1) : '0.0'}%`;

    const body = document.createElement('div');
    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = result.url || `/posts/${result.slug}`;
    link.textContent = result.title || result.slug || 'Artikel';
    heading.append(link);

    const meta = document.createElement('div');
    meta.className = 'grep-result__meta';
    if (result.heading) {
      meta.append(metaPart(`# ${result.heading}`));
    }
    if (result.category) {
      meta.append(metaPart(result.category));
    }
    if (Array.isArray(result.tags) && result.tags.length > 0) {
      meta.append(metaPart(result.tags.map((tag) => `#${tag}`).join(' ')));
    }

    const preview = document.createElement('p');
    preview.className = 'grep-result__preview';
    preview.textContent = result.content || result.excerpt || '';

    body.append(heading, meta, preview);
    article.append(score, body);
    return article;
  }

  function renderResults(results) {
    clearResults();
    if (!Array.isArray(results) || results.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'grep-empty';
      empty.textContent = 'Keine passenden Artikel gefunden.';
      resultsRoot.append(empty);
      return;
    }

    resultsRoot.append(...results.map(renderResult));
  }

  async function search(query) {
    const normalized = String(query || '').trim();
    if (normalized.length < 2) {
      input.focus();
      return;
    }

    submit.disabled = true;
    setStatus('Suche läuft …', 'loading');
    clearResults();
    const startedAt = window.performance.now();

    try {
      const params = new window.URLSearchParams({ q: normalized, limit: '8' });
      const response = await fetch(`/api/search?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const elapsed = Math.round(window.performance.now() - startedAt);
      renderResults(payload.results);
      setStatus(`${payload.results.length} Treffer · ${elapsed} ms`, 'success');

      const url = new window.URL(window.location.href);
      url.searchParams.set('q', normalized);
      window.history.replaceState(null, '', url);
    } catch (error) {
      setStatus(`Suche nicht verfügbar: ${error.message}`, 'error');
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search(input.value);
  });

  document.querySelectorAll('[data-grep-query]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.grepQuery || '';
      search(input.value);
    });
  });

  const initialQuery = new window.URL(window.location.href).searchParams.get('q');
  if (initialQuery) {
    input.value = initialQuery;
    search(initialQuery);
  }
})();
