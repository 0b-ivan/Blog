(() => {
  const buttons = [...document.querySelectorAll('[data-days]')];
  const articles = document.querySelector('[data-articles]');
  const searches = document.querySelector('[data-searches]');
  const gaps = document.querySelector('[data-gaps]');

  function duration(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    return safe >= 60 ? `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')} min` : `${safe}s`;
  }

  function setKpi(name, value) {
    const target = document.querySelector(`[data-kpi="${name}"]`);
    if (target) target.textContent = value;
  }

  function row(label, meta, value) {
    const item = document.createElement('div');
    item.className = 'analytics-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = label;
    detail.textContent = meta;
    copy.append(title, detail);
    const metric = document.createElement('b');
    metric.textContent = value;
    item.append(copy, metric);
    return item;
  }

  function renderList(root, items, formatter, empty) {
    root.replaceChildren();
    if (!items.length) {
      const message = document.createElement('p');
      message.className = 'analytics-empty';
      message.textContent = empty;
      root.append(message);
      return;
    }
    root.append(...items.map(formatter));
  }

  function readToken() {
    try {
      return window.sessionStorage.getItem('kernel-notes:analytics-token') || '';
    } catch (_error) {
      return '';
    }
  }

  function rememberToken(value) {
    try {
      window.sessionStorage.setItem('kernel-notes:analytics-token', value);
    } catch (_error) {
      // A private browser session may reject storage; the current request still works.
    }
  }

  async function load(days, allowPrompt = true) {
    const token = readToken();
    const response = await fetch(`/api/analytics/summary?days=${days}`, {
      cache: 'no-store',
      headers: token ? { 'X-Analytics-Token': token } : {}
    });
    if (response.status === 401 && allowPrompt) {
      const supplied = window.prompt('Analytics-Zugriffstoken');
      if (supplied) {
        rememberToken(supplied.trim());
        return load(days, false);
      }
      return;
    }
    if (!response.ok) return;
    const payload = await response.json();
    const totals = payload.totals || {};

    setKpi('views', String(totals.views || 0));
    setKpi('active', duration(totals.averageActiveSeconds || 0));
    setKpi('completion', `${totals.completionRate || 0}%`);
    setKpi('searches', String(totals.searches || 0));
    setKpi('ctr', `${totals.searchCtr || 0}%`);
    setKpi('zero', `${totals.zeroResultRate || 0}%`);

    renderList(articles, payload.topArticles || [], (item) =>
      row(item.slug, `Ø ${duration(item.averageActiveSeconds)} · ${item.completionRate}% bis Ende · ♥ ${item.likes}`, `${item.views} Views`),
      'Noch keine Artikelmetriken.'
    );
    renderList(searches, payload.topSearches || [], (item) =>
      row(item.query, `${item.clicks} Klicks · ${item.zeroResults} ohne Treffer`, `${item.searches} Suchen`),
      'Noch keine Suchdaten.'
    );
    renderList(gaps, payload.contentGaps || [], (item) =>
      row(item.query, 'Suchanfragen ohne Ergebnis', String(item.zeroResults)),
      'Aktuell keine erkannten Content-Gaps.'
    );
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((item) => item.classList.toggle('is-active', item === button));
      void load(button.dataset.days);
    });
  });

  void load(30);
})();
