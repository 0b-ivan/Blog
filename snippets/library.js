/* global document, fetch, window, navigator, hljs */

const root = document.getElementById('snippet-root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function snippetUrl(file) {
  return `/snippets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function selectedPath() {
  return decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
}

function highlight(code, language) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language }).value;
  }
  return hljs.highlightAuto(code).value;
}

function renderList(items) {
  root.innerHTML = `
    <div class="snippet-library__toolbar">
      <input class="snippet-library__search" type="search" placeholder="Snippet suchen …" aria-label="Snippet suchen" />
      <span>${items.length} Snippets</span>
    </div>
    <div class="snippet-library__grid"></div>`;

  const grid = root.querySelector('.snippet-library__grid');
  const input = root.querySelector('.snippet-library__search');

  const draw = () => {
    const query = input.value.trim().toLowerCase();
    const filtered = items.filter((item) => `${item.title} ${item.path} ${item.language} ${item.type} ${item.description} ${item.postTitle}`.toLowerCase().includes(query));
    grid.innerHTML = filtered.map((item) => `
      <a class="snippet-library__item" href="#/${encodeURIComponent(item.path)}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.type || item.language)}</span>
        ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}
      </a>`).join('');
  };

  input.addEventListener('input', draw);
  draw();
}

async function renderViewer(item) {
  const response = await fetch(snippetUrl(item.path));
  if (!response.ok) throw new Error('Snippet konnte nicht geladen werden');
  const source = await response.text();
  root.innerHTML = `
    <p><a href="/snippets/">← Alle Snippets</a></p>
    <p class="snippet-library__source">Aus Artikel: <a href="/posts/${encodeURIComponent(item.post)}">${escapeHtml(item.postTitle || item.post)}</a></p>
    <section class="code-snippet snippet-library__viewer">
      <header class="code-snippet__header">
        <div><p class="code-snippet__title">${escapeHtml(item.title)}</p><span class="code-snippet__meta">${escapeHtml(item.type || item.language)}</span></div>
        <button class="code-snippet__copy" type="button">Kopieren</button>
      </header>
      ${item.description ? `<p class="code-snippet__description">${escapeHtml(item.description)}</p>` : ''}
      <pre><code class="hljs language-${escapeHtml(item.language)}">${highlight(source, item.language)}</code></pre>
      <footer class="code-snippet__footer"><a href="${snippetUrl(item.path)}" download>Download</a> · <a href="${snippetUrl(item.path)}">Raw öffnen</a></footer>
    </section>`;
  root.querySelector('.code-snippet__copy').addEventListener('click', async (event) => {
    await navigator.clipboard.writeText(source);
    event.currentTarget.textContent = 'Kopiert';
    window.setTimeout(() => { event.currentTarget.textContent = 'Kopieren'; }, 1200);
  });
}

async function boot() {
  const response = await fetch('/snippets/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Snippet-Metadaten konnten nicht geladen werden');
  const items = await response.json();
  const path = selectedPath();
  if (!path) {
    renderList(items);
    return;
  }
  const item = items.find((candidate) => candidate.path === path);
  if (!item) {
    root.innerHTML = '<p>Snippet nicht gefunden. <a href="/snippets/">Zur Übersicht</a></p>';
    return;
  }
  await renderViewer(item);
}

window.addEventListener('hashchange', () => boot().catch(console.error));
boot().catch((error) => { root.textContent = error.message; });
