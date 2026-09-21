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
  const engagement = document.querySelector('.article-engagement');
  const progress = document.querySelector('[data-reading-progress]');
  const progressToggle = document.querySelector('[data-reading-progress-toggle]');
  const progressMeter = document.querySelector('[data-reading-progress-meter]');
  const progressBar = document.querySelector('[data-reading-progress-bar]');
  const progressValue = document.querySelector('[data-reading-progress-value]');
  const compactProgressValue = document.querySelector('[data-reading-progress-value-compact]');
  const mobileProgressMedia = window.matchMedia('(max-width: 620px)');
  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tagToggle = document.querySelector('[data-tag-toggle]');
  const extraTags = [...document.querySelectorAll('[data-extra-tag]')];
  if (!slug || !content) return;

  const likedKey = `kernel-notes:liked:${slug}`;
  const favoritesKey = 'kernel-notes:favorites';
  const progressPositionKey = 'kernel-notes:reading-progress-position';

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
  let currentProgressPercent = 0;
  let currentArticleEnded = false;
  let progressExpandedByUser = false;
  let progressCelebrated = false;
  let progressCelebrationActive = false;
  let progressDragState = null;
  let suppressProgressToggleClick = false;
  const progressCollapseScrollY = 140;
  const progressDragThreshold = 6;
  const progressEdgeInset = 12;

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

  function readProgressPosition() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(progressPositionKey) || 'null');
      if (!parsed || !['left', 'right'].includes(parsed.side) || !Number.isFinite(parsed.top)) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function writeProgressPosition(position) {
    try {
      window.localStorage.setItem(progressPositionKey, JSON.stringify(position));
    } catch (_error) {
      // Dragging still works for the current page when browser storage is unavailable.
    }
  }

  function clearProgressPositionStyles() {
    if (!progress) return;
    progress.style.left = '';
    progress.style.right = '';
    progress.style.top = '';
    progress.style.bottom = '';
  }

  function clampProgressTop(top, height) {
    const minTop = progressEdgeInset;
    const maxTop = Math.max(minTop, window.innerHeight - height - progressEdgeInset);
    return Math.max(minTop, Math.min(maxTop, top));
  }

  function applyStoredProgressPosition() {
    if (
      !progress
      || !mobileProgressMedia.matches
      || !progress.classList.contains('is-compact')
      || progress.classList.contains('is-dragging')
    ) {
      return;
    }

    const stored = readProgressPosition();
    if (!stored) {
      clearProgressPositionStyles();
      return;
    }

    const rect = progress.getBoundingClientRect();
    const top = clampProgressTop(stored.top, rect.height || 44);
    progress.style.top = `${top}px`;
    progress.style.bottom = 'auto';

    if (stored.side === 'left') {
      progress.style.left = `${progressEdgeInset}px`;
      progress.style.right = 'auto';
    } else {
      progress.style.left = 'auto';
      progress.style.right = `${progressEdgeInset}px`;
    }
  }

  function spawnProgressCompletionLiquid(rect) {
    if (reducedMotionMedia.matches || !rect) return;

    const layer = document.createElement('div');
    layer.className = 'reading-progress-burst';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--progress-hue', '120');

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const droplets = [
      { dx: -42, lift: -18, fall: 84, size: 8, delay: 0, duration: 900 },
      { dx: -25, lift: -30, fall: 112, size: 6, delay: 25, duration: 1050 },
      { dx: -10, lift: -24, fall: 96, size: 10, delay: 55, duration: 980 },
      { dx: 14, lift: -34, fall: 124, size: 7, delay: 10, duration: 1120 },
      { dx: 30, lift: -22, fall: 92, size: 9, delay: 45, duration: 1020 },
      { dx: 44, lift: -14, fall: 76, size: 6, delay: 80, duration: 920 }
    ];

    droplets.forEach((drop, index) => {
      const element = document.createElement('span');
      element.className = 'reading-progress-burst__droplet';
      element.style.left = `${centerX + ((index % 2) ? 3 : -3)}px`;
      element.style.top = `${centerY}px`;
      element.style.width = `${drop.size}px`;
      element.style.height = `${Math.round(drop.size * 1.28)}px`;
      element.style.setProperty('--drop-x', `${drop.dx}px`);
      element.style.setProperty('--drop-x-near', `${Math.round(drop.dx * 0.35)}px`);
      element.style.setProperty('--drop-x-far', `${Math.round(drop.dx * 1.12)}px`);
      element.style.setProperty('--drop-lift', `${drop.lift}px`);
      element.style.setProperty('--drop-lift-soft', `${Math.round(drop.lift * 0.35)}px`);
      element.style.setProperty('--drop-fall', `${drop.fall}px`);
      element.style.animationDelay = `${drop.delay}ms`;
      element.style.animationDuration = `${drop.duration}ms`;
      layer.appendChild(element);
    });

    const drips = [
      { offset: -11, length: 96, delay: 80, duration: 1250, width: 5 },
      { offset: 7, length: 132, delay: 140, duration: 1500, width: 4 },
      { offset: 18, length: 72, delay: 210, duration: 1050, width: 3 }
    ];

    drips.forEach((drip) => {
      const element = document.createElement('span');
      element.className = 'reading-progress-burst__drip';
      element.style.left = `${centerX + drip.offset}px`;
      element.style.top = `${centerY + rect.height * 0.25}px`;
      element.style.width = `${drip.width}px`;
      element.style.setProperty('--drip-length', `${drip.length}px`);
      element.style.animationDelay = `${drip.delay}ms`;
      element.style.animationDuration = `${drip.duration}ms`;
      layer.appendChild(element);
    });

    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 1900);
  }
  function celebrateProgressCompletion() {
    if (!progress || progressCelebrated) return;

    progressCelebrated = true;
    progressCelebrationActive = true;
    progressExpandedByUser = false;
    progress.classList.remove('is-complete', 'is-expanded', 'is-dragging');
    progress.classList.add('is-visible', 'is-compact', 'is-popping');
    if (progressToggle) progressToggle.setAttribute('aria-expanded', 'false');

    window.requestAnimationFrame(() => {
      applyStoredProgressPosition();
      const rect = progress.getBoundingClientRect();
      spawnProgressCompletionLiquid(rect);
    });

    window.setTimeout(() => {
      progressCelebrationActive = false;
      progress.classList.remove('is-visible', 'is-compact', 'is-popping');
      progress.classList.add('is-complete');
      clearProgressPositionStyles();
    }, reducedMotionMedia.matches ? 120 : 680);
  }

  function applyProgressState() {
    const safePercent = Math.max(0, Math.min(100, Number(currentProgressPercent) || 0));
    const visible = safePercent > 2 && safePercent < 100 && !currentArticleEnded;
    const compactEligible = visible && window.scrollY > progressCollapseScrollY;
    const compact = compactEligible && !progressExpandedByUser;

    if (window.scrollY <= progressCollapseScrollY) {
      progressExpandedByUser = false;
    }

    if (progressBar) progressBar.style.transform = `scaleX(${safePercent / 100})`;
    if (progressValue) progressValue.textContent = String(safePercent);
    if (compactProgressValue) compactProgressValue.textContent = String(safePercent);

    if (progressMeter) {
      progressMeter.setAttribute('aria-valuenow', String(safePercent));
    }

    if (progress) {
      progress.style.setProperty('--progress-percent', `${safePercent}%`);
      progress.style.setProperty('--progress-hue', String(Math.round(safePercent * 1.2)));

      if (progressCelebrationActive) return;

      if (progressCelebrated) {
        progress.classList.remove('is-visible', 'is-compact', 'is-expanded', 'is-dragging');
        progress.classList.add('is-complete');
        clearProgressPositionStyles();
        return;
      }

      progress.classList.toggle('is-visible', visible);
      progress.classList.toggle('is-complete', !visible);
      progress.classList.toggle('is-compact', compact);
      progress.classList.toggle('is-expanded', visible && !compact);

      if (compact) {
        window.requestAnimationFrame(applyStoredProgressPosition);
      } else {
        clearProgressPositionStyles();
      }
    }

    if (progressToggle) {
      progressToggle.setAttribute('aria-expanded', String(visible && !compact));
      progressToggle.setAttribute(
        'aria-label',
        compact
          ? `Lesefortschritt: ${safePercent} Prozent. Anzeige aufklappen.`
          : `Lesefortschritt: ${safePercent} Prozent. Anzeige einklappen.`
      );
    }
  }

  function updateProgress(percent, articleEnded = false) {
    currentProgressPercent = Math.max(0, Math.min(100, Number(percent) || 0));
    currentArticleEnded = Boolean(articleEnded);
    applyProgressState();

    if (currentProgressPercent >= 100) {
      celebrateProgressCompletion();
    }
  }

  function checkScroll() {
    const rect = content.getBoundingClientRect();
    const total = Math.max(1, content.scrollHeight);
    const seen = Math.min(total, Math.max(0, window.innerHeight - rect.top));
    const measuredPercent = Math.round((seen / total) * 100);
    const articleEnded = Boolean(
      engagement && engagement.getBoundingClientRect().top <= window.innerHeight * 0.92
    );
    const percent = articleEnded ? 100 : measuredPercent;
    updateProgress(percent, articleEnded);

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

  function canDragProgress() {
    return Boolean(
      progress
      && progressToggle
      && mobileProgressMedia.matches
      && progress.classList.contains('is-compact')
      && !progressCelebrationActive
      && !progressCelebrated
    );
  }

  function startProgressDrag(event) {
    if (!canDragProgress()) return;

    const rect = progress.getBoundingClientRect();
    progressDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };

    progress.style.left = `${rect.left}px`;
    progress.style.right = 'auto';
    progress.style.top = `${rect.top}px`;
    progress.style.bottom = 'auto';
    progress.classList.add('is-dragging');
    progressToggle.setPointerCapture?.(event.pointerId);
  }

  function moveProgressDrag(event) {
    if (!progressDragState || event.pointerId !== progressDragState.pointerId) return;

    const dx = event.clientX - progressDragState.startX;
    const dy = event.clientY - progressDragState.startY;
    if (!progressDragState.moved && Math.hypot(dx, dy) < progressDragThreshold) return;

    progressDragState.moved = true;
    event.preventDefault();

    const rect = progress.getBoundingClientRect();
    const maxLeft = Math.max(progressEdgeInset, window.innerWidth - rect.width - progressEdgeInset);
    const left = Math.max(progressEdgeInset, Math.min(maxLeft, progressDragState.left + dx));
    const top = clampProgressTop(progressDragState.top + dy, rect.height);
    progress.style.left = `${left}px`;
    progress.style.top = `${top}px`;
  }

  function finishProgressDrag(event) {
    if (!progressDragState || event.pointerId !== progressDragState.pointerId) return;

    const moved = progressDragState.moved;
    progressToggle.releasePointerCapture?.(event.pointerId);
    progress.classList.remove('is-dragging');
    progressDragState = null;

    if (!moved) return;

    const rect = progress.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const top = clampProgressTop(rect.top, rect.height);
    writeProgressPosition({ side, top });
    suppressProgressToggleClick = true;
    applyStoredProgressPosition();
  }

  if (progressToggle) {
    progressToggle.addEventListener('pointerdown', startProgressDrag);
    progressToggle.addEventListener('pointermove', moveProgressDrag);
    progressToggle.addEventListener('pointerup', finishProgressDrag);
    progressToggle.addEventListener('pointercancel', finishProgressDrag);

    progressToggle.addEventListener('click', () => {
      if (suppressProgressToggleClick) {
        suppressProgressToggleClick = false;
        return;
      }
      if (
        currentArticleEnded
        || currentProgressPercent <= 2
        || window.scrollY <= progressCollapseScrollY
        || progressCelebrated
      ) {
        return;
      }
      progressExpandedByUser = !progressExpandedByUser;
      applyProgressState();
    });
  }

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
