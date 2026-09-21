(() => {
  const article = document.querySelector('.post-page[data-post-slug]');
  if (!article) return;

  const slug = article.dataset.postSlug;
  const content = article.querySelector('.terminal-content');
  const metricNodes = (name) => [...document.querySelectorAll(`[data-article-metric="${name}"]`)];
  const likeButton = document.querySelector('[data-article-like]');
  const likeIcon = document.querySelector('[data-like-icon]');
  const likeLabel = document.querySelector('[data-like-label]');
  const favoriteButton = document.querySelector('[data-article-favorite]');
  const favoriteIcon = document.querySelector('[data-favorite-icon]');
  const favoriteLabel = document.querySelector('[data-favorite-label]');
  const shareButton = document.querySelector('[data-article-share]');
  const actionStatus = document.querySelector('[data-article-action-status]');
  const progress = document.querySelector('[data-reading-progress]');
  const progressBar = document.querySelector('[data-reading-progress-bar]');
  const progressValue = document.querySelector('[data-reading-progress-value]');
  const tagToggle = document.querySelector('[data-tag-toggle]');
  const extraTags = [...document.querySelectorAll('[data-extra-tag]')];
  if (!slug || !content) return;

  const likedKey = `kernel-notes:liked:${slug}`;
  const favoritesKey = 'kernel-notes:favorites';

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

  function readFavorites() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(favoritesKey) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : []);
    } catch (_error) {
      return new Set();
    }
  }

  function writeFavorites(favorites) {
    try {
      window.localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function setActionStatus(message) {
    if (!actionStatus) return;
    actionStatus.textContent = message;
  }

  const thresholds = new Set();
  let lastActivity = Date.now();
  let pendingActiveSeconds = 0;
  let completed = false;

  function render(metrics) {
    metricNodes('views').forEach((node) => { node.textContent = String(metrics.views || 0); });
    metricNodes('likes').forEach((node) => { node.textContent = String(metrics.likes || 0); });
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

  function updateProgress(percent) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    if (progressBar) progressBar.style.transform = `scaleX(${safePercent / 100})`;
    if (progressValue) progressValue.textContent = String(safePercent);
    if (progress) progress.setAttribute('aria-valuenow', String(safePercent));
  }

  function checkScroll() {
    const rect = content.getBoundingClientRect();
    const total = Math.max(1, content.scrollHeight);
    const seen = Math.min(total, Math.max(0, window.innerHeight - rect.top));
    const percent = Math.round((seen / total) * 100);
    updateProgress(percent);

    [25, 50, 75, 90, 100].forEach((threshold) => {
      if (percent < threshold || thresholds.has(threshold)) return;
      thresholds.add(threshold);
      const isCompletion = threshold >= 90 && !completed;
      if (isCompletion) completed = true;
      event({ type: 'article_scroll', percent: threshold, completed: isCompletion });
    });
  }

  function syncLikeState() {
    const liked = hasLiked();
    if (!likeButton) return;
    likeButton.setAttribute('aria-pressed', String(liked));
    likeButton.classList.toggle('is-liked', liked);
    if (likeIcon) likeIcon.textContent = liked ? '♥' : '♡';
    if (likeLabel) likeLabel.textContent = liked ? 'Gefällt dir' : 'Gefällt mir';
  }

  function syncFavoriteState() {
    if (!favoriteButton) return;
    const saved = readFavorites().has(slug);
    favoriteButton.setAttribute('aria-pressed', String(saved));
    favoriteButton.classList.toggle('is-favorite', saved);
    if (favoriteIcon) favoriteIcon.textContent = saved ? '★' : '☆';
    if (favoriteLabel) favoriteLabel.textContent = saved ? 'Gespeichert' : 'Für später speichern';
  }

  ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((name) => {
    window.addEventListener(name, markActivity, { passive: true });
  });
  window.addEventListener('scroll', checkScroll, { passive: true });
  window.addEventListener('resize', checkScroll, { passive: true });

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
    syncLikeState();
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
          syncLikeState();
          render(metrics);
          setActionStatus('Danke für dein Feedback.');
        }
      } finally {
        likeButton.disabled = false;
      }
    });
  }

  if (favoriteButton) {
    syncFavoriteState();
    favoriteButton.addEventListener('click', () => {
      const favorites = readFavorites();
      const saved = favorites.has(slug);
      if (saved) favorites.delete(slug);
      else favorites.add(slug);

      if (!writeFavorites(favorites)) {
        setActionStatus('Favorit konnte in diesem Browser nicht gespeichert werden.');
        return;
      }

      syncFavoriteState();
      setActionStatus(saved ? 'Aus den Favoriten entfernt.' : 'Für später in diesem Browser gespeichert.');
    });
  }

  if (shareButton) {
    shareButton.addEventListener('click', async () => {
      const shareData = {
        title: document.title.replace(/\s*\|\s*Kernel Notes\s*$/, ''),
        url: window.location.href
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          setActionStatus('Artikel geteilt.');
          return;
        }

        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareData.url);
          setActionStatus('Link in die Zwischenablage kopiert.');
          return;
        }

        setActionStatus('Teilen wird von diesem Browser nicht unterstützt.');
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setActionStatus('Teilen war gerade nicht möglich.');
        }
      }
    });
  }

  if (tagToggle && extraTags.length) {
    tagToggle.addEventListener('click', () => {
      const expanded = tagToggle.getAttribute('aria-expanded') === 'true';
      extraTags.forEach((tag) => { tag.hidden = expanded; });
      tagToggle.setAttribute('aria-expanded', String(!expanded));
      tagToggle.textContent = expanded ? `+${tagToggle.dataset.hiddenCount}` : 'Weniger';
      tagToggle.setAttribute(
        'aria-label',
        expanded ? `${tagToggle.dataset.hiddenCount} weitere Tags anzeigen` : 'Zusätzliche Tags ausblenden'
      );
    });
  }

  document.querySelectorAll('.article-metric[data-tooltip]').forEach((metric) => {
    metric.addEventListener('click', () => metric.focus());
  });

  event({ type: 'article_view' });
  window.setTimeout(() => {
    void request(`/api/analytics/article/${encodeURIComponent(slug)}`)
      .then((metrics) => { if (metrics) render(metrics); });
  }, 150);
  checkScroll();
})();
