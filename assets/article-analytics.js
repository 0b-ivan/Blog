(() => {
  const article = document.querySelector('.post-page[data-post-slug]');
  if (!article) return;

  const slug = article.dataset.postSlug;
  const content = article.querySelector('.terminal-content');
  const terminal = content?.closest('.terminal-post');
  const metricNodes = (name) => [...document.querySelectorAll(`[data-article-metric="${name}"]`)];
  const likeButton = document.querySelector('[data-article-like]');
  const likeIcon = document.querySelector('[data-like-icon]');
  const likeLabel = document.querySelector('[data-like-label]');
  const shareButton = document.querySelector('[data-article-share]');
  const actionStatus = document.querySelector('[data-article-action-status]');
  const engagement = document.querySelector('.article-engagement');
  const progress = document.querySelector('[data-reading-progress]');
  const progressToggle = document.querySelector('[data-reading-progress-toggle]');
  const progressMeter = document.querySelector('[data-reading-progress-meter]');
  const progressBar = document.querySelector('[data-reading-progress-bar]');
  const progressValue = document.querySelector('[data-reading-progress-value]');
  const compactProgressValue = document.querySelector('[data-reading-progress-value-compact]');
  const riveCanvas = document.querySelector('[data-reading-progress-rive]');
  const mobileProgressMedia = window.matchMedia('(max-width: 620px)');
  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tagToggle = document.querySelector('[data-tag-toggle]');
  const extraTags = [...document.querySelectorAll('[data-extra-tag]')];
  if (!slug || !content) return;

  const likedKey = `kernel-notes:liked:${slug}`;
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
  let riveInstance = null;
  let riveProgressInput = null;
  let riveStartInput = null;
  let riveReady = false;
  let riveLoadPromise = null;
  let riveInitPromise = null;
  const rivePreloadPercent = 75;
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

  function loadRiveRuntime() {
    if (window.rive?.Rive) return Promise.resolve(window.rive);
    if (riveLoadPromise) return riveLoadPromise;

    riveLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-rive-runtime]');
      const script = existing || document.createElement('script');

      const finish = () => {
        if (window.rive?.Rive) resolve(window.rive);
        else reject(new Error('Rive runtime did not expose window.rive.Rive'));
      };

      if (existing) {
        if (existing.dataset.loaded === 'true') {
          finish();
          return;
        }
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Rive runtime failed to load')), { once: true });
        return;
      }

      script.src = '/vendor/rive/rive.js';
      script.async = true;
      script.dataset.riveRuntime = 'true';
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        finish();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error('Rive runtime failed to load')), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      riveLoadPromise = null;
      if (riveCanvas) {
        riveCanvas.dataset.riveState = 'error';
        riveCanvas.dataset.riveError = error.message;
      }
      return null;
    });

    return riveLoadPromise;
  }

  async function initRiveProgress() {
    if (!riveCanvas || reducedMotionMedia.matches) return false;
    if (riveReady) return true;
    if (riveInitPromise) return riveInitPromise;

    riveInitPromise = (async () => {
      riveCanvas.dataset.riveState = 'loading';
      const runtime = await loadRiveRuntime();
      if (!runtime?.Rive) return false;

      runtime.RuntimeLoader?.setWasmUrl?.('/vendor/rive/rive.wasm');
      const stateMachineName = 'Download';

      return new Promise((resolve) => {
        try {
          riveInstance = new runtime.Rive({
            src: '/assets/rive/liquid_download.riv',
            canvas: riveCanvas,
            artboard: 'Artboard',
            autoplay: true,
            stateMachines: stateMachineName,
            enableRiveAssetCDN: false,
            isTouchScrollEnabled: true,
            onLoad: () => {
              try {
                const inputs = riveInstance.stateMachineInputs(stateMachineName) || [];
                riveProgressInput = inputs.find((input) => input.name === 'Progress') || null;
                riveStartInput = inputs.find((input) => input.name === 'Download') || null;
                if (!riveProgressInput) {
                  throw new Error('Rive Progress input was not found');
                }
                riveProgressInput.value = currentProgressPercent;
                riveReady = true;
                riveCanvas.dataset.riveReady = 'true';
                riveCanvas.dataset.riveState = 'ready';
                resolve(true);
              } catch (error) {
                riveReady = false;
                riveCanvas.dataset.riveState = 'error';
                riveCanvas.dataset.riveError = error.message;
                resolve(false);
              }
            },
            onLoadError: (error) => {
              riveReady = false;
              riveInstance = null;
              riveCanvas.dataset.riveState = 'error';
              riveCanvas.dataset.riveError = error?.message || 'Rive asset failed to load';
              resolve(false);
            }
          });
        } catch (error) {
          riveReady = false;
          riveInstance = null;
          riveCanvas.dataset.riveState = 'error';
          riveCanvas.dataset.riveError = error.message;
          resolve(false);
        }
      });
    })();

    const ready = await riveInitPromise;
    if (!ready) riveInitPromise = null;
    return ready;
  }

  function syncRiveProgress(percent) {
    if (percent >= rivePreloadPercent && !riveReady && !riveInstance && !reducedMotionMedia.matches) {
      void initRiveProgress();
    }
    if (!riveReady || !riveProgressInput) return;
    riveProgressInput.value = percent;
  }

  function startRiveCompletion() {
    if (!riveReady || !riveInstance) {
      void initRiveProgress().then((ready) => {
        if (ready && progressCelebrationActive) startRiveCompletion();
      });
      return false;
    }

    try {
      riveInstance.resizeDrawingSurfaceToCanvas();
      if (riveStartInput?.fire) riveStartInput.fire();
      if (riveProgressInput) riveProgressInput.value = 100;
      progress?.classList.add('is-rive-active');
      return true;
    } catch (error) {
      riveCanvas.dataset.riveState = 'error';
      riveCanvas.dataset.riveError = error.message;
      progress?.classList.remove('is-rive-active');
      return false;
    }
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

    const particles = [
      { emoji: '👍', size: 30, drift: -76, rise: 188, rotate: -18, delay: 0, duration: 3100 },
      { emoji: '👍🏻', size: 38, drift: -42, rise: 236, rotate: 14, delay: 70, duration: 3500 },
      { emoji: '👍🏼', size: 26, drift: -12, rise: 205, rotate: -10, delay: 150, duration: 3250 },
      { emoji: '👍🏽', size: 46, drift: 20, rise: 258, rotate: 16, delay: 40, duration: 3700 },
      { emoji: '👍🏾', size: 34, drift: 52, rise: 218, rotate: -14, delay: 190, duration: 3400 },
      { emoji: '👍🏿', size: 29, drift: 82, rise: 192, rotate: 11, delay: 110, duration: 3200 },
      { emoji: '👍', size: 42, drift: 8, rise: 282, rotate: -8, delay: 230, duration: 3900 },
      { emoji: '❓', size: 31, drift: 58, rise: 268, rotate: 9, delay: 280, duration: 3800 }
    ];

    particles.forEach((particle, index) => {
      const element = document.createElement('span');
      element.className = 'reading-progress-burst__particle';
      element.textContent = particle.emoji;
      element.style.left = `${centerX + ((index % 3) - 1) * 5}px`;
      element.style.top = `${centerY + (index % 2) * 4}px`;
      element.style.fontSize = `${particle.size}px`;
      element.style.setProperty('--particle-drift', `${particle.drift}px`);
      element.style.setProperty('--particle-rise', `${particle.rise}px`);
      element.style.setProperty('--particle-rotate', `${particle.rotate}deg`);
      element.style.animationDelay = `${particle.delay}ms`;
      element.style.animationDuration = `${particle.duration}ms`;
      layer.appendChild(element);
    });

    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 4400);
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
      startRiveCompletion();
      const rect = progress.getBoundingClientRect();
      spawnProgressCompletionLiquid(rect);
    });

    window.setTimeout(() => {
      progressCelebrationActive = false;
      progress.classList.remove('is-visible', 'is-compact', 'is-popping', 'is-rive-active');
      progress.classList.add('is-complete');
      clearProgressPositionStyles();
    }, reducedMotionMedia.matches ? 120 : 1250);
  }

  function terminalIsMaximized() {
    return Boolean(terminal?.classList.contains('is-maximized'));
  }

  function progressScrollOffset() {
    return terminalIsMaximized() ? terminal.scrollTop : window.scrollY;
  }

  function applyProgressState() {
    const safePercent = Math.max(0, Math.min(100, Number(currentProgressPercent) || 0));
    const visible = safePercent > 2 && safePercent < 100 && !currentArticleEnded;
    const scrollOffset = progressScrollOffset();
    const compactEligible = visible && scrollOffset > progressCollapseScrollY;
    const compact = compactEligible && !progressExpandedByUser;

    if (scrollOffset <= progressCollapseScrollY) {
      progressExpandedByUser = false;
    }

    if (progressBar) progressBar.style.transform = `scaleX(${safePercent / 100})`;
    syncRiveProgress(safePercent);
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
    const total = Math.max(1, content.scrollHeight);
    let seen = 0;
    let articleEnded = false;

    if (terminalIsMaximized()) {
      const terminalRect = terminal.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const contentStart = terminal.scrollTop + (contentRect.top - terminalRect.top);
      const viewportBottom = terminal.scrollTop + terminal.clientHeight;
      seen = Math.min(total, Math.max(0, viewportBottom - contentStart));
      articleEnded = seen >= total - 2;
    } else {
      const rect = content.getBoundingClientRect();
      seen = Math.min(total, Math.max(0, window.innerHeight - rect.top));
      articleEnded = Boolean(
        engagement && engagement.getBoundingClientRect().top <= window.innerHeight * 0.92
      );
    }

    const measuredPercent = Math.round((seen / total) * 100);
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

  ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((name) => {
    window.addEventListener(name, markActivity, { passive: true });
  });
  window.addEventListener('scroll', checkScroll, { passive: true });
  window.addEventListener('resize', checkScroll, { passive: true });

  if (terminal) {
    terminal.addEventListener('scroll', () => {
      markActivity();
      if (terminalIsMaximized()) checkScroll();
    }, { passive: true });
  }

  window.addEventListener('kernel-notes:terminal-mode', () => {
    progressExpandedByUser = false;
    window.requestAnimationFrame(checkScroll);
  });

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
        || progressScrollOffset() <= progressCollapseScrollY
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
