(() => {
  const links = [...document.querySelectorAll('[data-pdf-download]')];
  if (!links.length) return;

  const status = document.querySelector('[data-article-action-status]');
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function requestState(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });

    const body = await response.json().catch(() => ({
      ready: false,
      preparing: false
    }));

    if (!response.ok) {
      throw new Error(body.message || `PDF service returned HTTP ${response.status}`);
    }

    return body;
  }

  async function preparePdf(slug) {
    const encoded = encodeURIComponent(slug);
    let state = await requestState(`/api/pdf/${encoded}/prepare`, {
      method: 'POST'
    });

    if (state.ready) return;

    for (let attempt = 1; attempt <= 120; attempt += 1) {
      await sleep(1000);
      state = await requestState(`/api/pdf/${encoded}/status?attempt=${attempt}`);
      if (state.ready) return;

      if (!state.preparing && attempt % 5 === 0) {
        state = await requestState(`/api/pdf/${encoded}/prepare?retry=${attempt}`, {
          method: 'POST'
        });
        if (state.ready) return;
      }
    }

    throw new Error('PDF preparation timed out');
  }

  for (const link of links) {
    link.addEventListener('click', async (event) => {
      if (link.dataset.pdfReady === 'true') return;
      event.preventDefault();

      if (link.dataset.pdfPreparing === 'true') return;

      const slug = String(link.dataset.pdfSlug || '').trim();
      if (!slug) {
        window.location.assign(link.href);
        return;
      }

      link.dataset.pdfPreparing = 'true';
      link.setAttribute('aria-busy', 'true');
      setStatus('PDF wird vorbereitet …');

      try {
        await preparePdf(slug);
        link.dataset.pdfReady = 'true';
        setStatus('PDF ist bereit. Download startet …');
        window.location.assign(link.href);
      } catch (error) {
        console.error(error);
        setStatus('PDF konnte nicht vorbereitet werden. Bitte erneut versuchen.');
      } finally {
        link.dataset.pdfPreparing = 'false';
        link.removeAttribute('aria-busy');
      }
    });
  }
})();