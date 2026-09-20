(() => {
  const root = document.querySelector('[data-home-status]');
  if (!root) return;

  const dot = root.querySelector('[data-home-status-dot]');
  const label = root.querySelector('[data-home-status-label]');
  const detail = root.querySelector('[data-home-status-detail]');

  function render(state, workloads = []) {
    const normalized = ['operational', 'degraded'].includes(state) ? state : 'unavailable';
    root.dataset.state = normalized;
    if (dot) dot.dataset.state = normalized;

    if (label) {
      label.textContent = normalized === 'operational'
        ? 'Alle Systeme betriebsbereit'
        : normalized === 'degraded'
          ? 'Eingeschränkter Betrieb'
          : 'Status nicht verfügbar';
    }

    if (detail) {
      const parts = workloads
        .filter((item) => item && item.name)
        .slice(0, 4)
        .map((item) => `${item.name} ${item.ready}/${item.desired}`);
      detail.textContent = parts.length ? parts.join(' · ') : 'Live-Status ansehen';
    }
  }

  fetch('/api/kubernetes-status', { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json();
      render(response.ok ? payload.status : 'unavailable', payload.workloads || []);
    })
    .catch(() => render('unavailable'));
})();
