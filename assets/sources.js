(() => {
  const list = document.querySelector('#sources-list');
  const status = document.querySelector('#sources-status');
  const filter = document.querySelector('#sources-filter');

  if (!list || !status || !filter) {
    return;
  }

  let sources = [];

  function normalized(value) {
    return String(value || '').toLocaleLowerCase('de');
  }

  function sourceMatches(source, query) {
    if (!query) {
      return true;
    }

    return [source.id, source.title, source.publisher, source.url]
      .some((value) => normalized(value).includes(query));
  }

  function createSourceCard(source) {
    const article = document.createElement('article');
    article.className = 'source-card';
    article.id = source.id;

    const meta = document.createElement('p');
    meta.className = 'source-meta';
    meta.textContent = `${source.publisher} · ${source.id}`;

    const title = document.createElement('h2');
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.title;
    title.append(link);

    const details = document.createElement('p');
    details.className = 'source-details';
    details.textContent = source.accessed_at
      ? `Abgerufen am ${source.accessed_at}`
      : 'Abrufdatum nicht hinterlegt';

    const url = document.createElement('p');
    url.className = 'source-url';
    url.textContent = source.url;

    article.append(meta, title, details, url);
    return article;
  }

  function render() {
    const query = normalized(filter.value.trim());
    const visible = sources.filter((source) => sourceMatches(source, query));

    list.replaceChildren(...visible.map(createSourceCard));
    status.textContent = query
      ? `${visible.length} von ${sources.length} Quellen gefunden.`
      : `${sources.length} Quellen zentral hinterlegt.`;

    if (!query && window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView({ block: 'center' });
      target?.classList.add('source-card-target');
    }
  }

  fetch('/posts/_sources.json', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((catalog) => {
      sources = Object.entries(catalog)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => {
          const publisher = String(a.publisher || '').localeCompare(String(b.publisher || ''), 'de');
          return publisher || String(a.title || '').localeCompare(String(b.title || ''), 'de');
        });
      render();
    })
    .catch((error) => {
      console.error('Could not load source catalog:', error);
      status.textContent = 'Das Quellenverzeichnis konnte nicht geladen werden.';
    });

  filter.addEventListener('input', render);
})();
