/* global document, fetch, window, navigator, hljs */

const root = document.getElementById('snippet-root');

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
    const filtered = items.filter((item) => `${item.title} ${item.path} ${item.language}`.toLowerCase().includes(query));
    grid.innerHTML = filtered.map((item) => `
      <a class="snippet-library__item" href="#/${encodeURIComponent(item.path)}">
        <strong>${item.title}</strong>
        <span>${item.language} · ${item.path}</span>
      </a>`).join('');
  };

  input.addEventListener('input', draw);
  draw();
}

async function renderViewer(item, posts) {
  const response = await fetch(`/snippets/${item.path}`);
  if (!response.ok) throw new Error('Snippet konnte nicht geladen werden');
  const source = await response.text();
  const post = posts.find((candidate) => candidate.slug === item.post);
  const postTitle = post?.title || item.post;
  root.innerHTML = `
    <p><a href="/snippets/">← Alle Snippets</a></p>
    <aside class="snippet-library__context" aria-label="Verwendung des Snippets">
      <div><span>Verwendung</span><strong>${item.usage || item.language}</strong></div>
      <div><span>Verwendet in</span><a href="/posts/${encodeURIComponent(item.post)}">${postTitle}</a></div>
    </aside>
    <section class="code-snippet snippet-library__viewer">
      <header class="code-snippet__header">
        <div><p class="code-snippet__title">${item.title}</p><span class="code-snippet__meta">${item.language} · ${item.path}</span></div>
        <button class="code-snippet__copy" type="button">Kopieren</button>
      </header>
      <pre><code class="hljs language-${item.language}">${highlight(source, item.language)}</code></pre>
      <footer class="code-snippet__footer"><a href="/snippets/${item.path}">Raw öffnen</a></footer>
    </section>`;
  root.querySelector('.code-snippet__copy').addEventListener('click', async (event) => {
    await navigator.clipboard.writeText(source);
    event.currentTarget.textContent = 'Kopiert';
    window.setTimeout(() => { event.currentTarget.textContent = 'Kopieren'; }, 1200);
  });
}

async function boot() {
  const [manifestResponse, postsResponse] = await Promise.all([
    fetch('/snippets/manifest.json', { cache: 'no-store' }),
    fetch('/api/posts', { headers: { Accept: 'application/json' } })
  ]);
  if (!manifestResponse.ok || !postsResponse.ok) throw new Error('Snippet-Metadaten konnten nicht geladen werden');
  const [items, posts] = await Promise.all([manifestResponse.json(), postsResponse.json()]);
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
  await renderViewer(item, posts);
}

window.addEventListener('hashchange', () => boot().catch(console.error));
boot().catch((error) => { root.textContent = error.message; });
