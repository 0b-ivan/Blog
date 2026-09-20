(() => {
  const article = document.querySelector('.post-page[data-post-slug]');
  if (!article) return;

  const slug = article.dataset.postSlug;
  const content = article.querySelector('.terminal-content');
  const views = document.querySelector('[data-article-metric="views"]');
  const active = document.querySelector('[data-article-metric="active"]');
  const completion = document.querySelector('[data-article-metric="completion"]');
  const likes = document.querySelector('[data-article-metric="likes"]');
  const likeButton = document.querySelector('[data-article-like]');
  if (!slug || !content) return;

  const likedKey = `kernel-notes:liked:${slug}`;

  function hasLiked() {
    try {
      return window.localStorage.getItem(likedKey) === '1';
    } catch (_error) {
      return false;
    }
  }

  function rememberLike() {
    try {
      window.localStorage.setItem(likedKey, '1');
    } catch (_error) {
      // The like still counts even when browser storage is unavailable.
    }
  }

  const thresholds = new Set();
  let lastActivity = Date.now();
  let pendingActiveSeconds = 0;
  let completed = false;

  function formatDuration(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return minutes ? `${minutes}:${String(rest).padStart(2, '0')} min` : `${rest}s`;
  }

  function render(metrics) {
    if (views) views.textContent = String(metrics.views || 0);
    if (active) active.textContent = formatDuration(metrics.averageActiveSeconds || 0);
    if (completion) completion.textContent = `${metrics.completionRate || 0}%`;
    if (likes) likes.textContent = String(metrics.likes || 0);
  }

  async function request(url, options) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options
    });
    return response.ok ? response.json() : null;
  }

  function event(payload) {
    const body = JSON.stringify({ ...payload, slug });
    if (navigator.sendBeacon && payload.type === 'article_active') {
      return navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }));
    }
    void request('/api/analytics/event', { method: 'POST', body });
    return true;
  }

  function markActivity() {
    lastActivity = Date.now();
  }

  function activeNow() {
    return document.visibilityState === 'visible' && Date.now() - lastActivity < 30_000;
  }

  function flushActive() {
    if (pendingActiveSeconds <= 0) return;
    const seconds = pendingActiveSeconds;
    pendingActiveSeconds = 0;
    event({ type: 'article_active', seconds });
  }

  function checkScroll() {
    const rect = content.getBoundingClientRect();
    const total = Math.max(1, content.scrollHeight);
    const seen = Math.min(total, Math.max(0, window.innerHeight - rect.top));
    const percent = Math.round((seen / total) * 100);
    [25, 50, 75, 90, 100].forEach((threshold) => {
      if (percent < threshold || thresholds.has(threshold)) return;
      thresholds.add(threshold);
      const isCompletion = threshold >= 90 && !completed;
      if (isCompletion) completed = true;
      event({ type: 'article_scroll', percent: threshold, completed: isCompletion });
    });
  }

  ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((name) => {
    window.addEventListener(name, markActivity, { passive: true });
  });
  window.addEventListener('scroll', checkScroll, { passive: true });

  window.setInterval(() => {
    if (activeNow()) pendingActiveSeconds += 5;
    if (pendingActiveSeconds >= 15) flushActive();
    checkScroll();
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') flushActive();
  });
  window.addEventListener('pagehide', flushActive);

  if (likeButton) {
    const alreadyLiked = hasLiked();
    likeButton.setAttribute('aria-pressed', String(alreadyLiked));
    if (alreadyLiked) likeButton.classList.add('is-liked');

    likeButton.addEventListener('click', async () => {
      if (hasLiked()) return;
      likeButton.disabled = true;
      try {
        const metrics = await request(`/api/analytics/like/${encodeURIComponent(slug)}`, {
          method: 'POST',
          body: '{}'
        });
        if (metrics) {
          rememberLike();
          likeButton.classList.add('is-liked');
          likeButton.setAttribute('aria-pressed', 'true');
          render(metrics);
        }
      } finally {
        likeButton.disabled = false;
      }
    });
  }

  event({ type: 'article_view' });
  window.setTimeout(() => {
    void request(`/api/analytics/article/${encodeURIComponent(slug)}`)
      .then((metrics) => { if (metrics) render(metrics); });
  }, 150);
  checkScroll();
})();
