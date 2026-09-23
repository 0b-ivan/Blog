(() => {
  const terminal = globalThis.document.querySelector('.terminal-post--article.terminal-post--has-cover');
  const hero = terminal?.querySelector('[data-article-hero]');
  if (!terminal || !hero) return;

  const mobileMedia = globalThis.matchMedia('(max-width: 620px)');
  const reducedMotionMedia = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

  let frame = 0;
  let startY = 0;
  let travel = 1;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function setMotion(progress) {
    const y = 14 * progress;
    const scale = 1.025 + (0.03 * progress);
    const tilt = 0.55 * progress;
    const blur = 0.65 + (1.35 * progress);
    const brightness = 0.95 - (0.07 * progress);

    terminal.style.setProperty('--article-cover-motion-y', `${y.toFixed(2)}px`);
    terminal.style.setProperty('--article-cover-motion-scale', scale.toFixed(4));
    terminal.style.setProperty('--article-cover-motion-tilt', `${tilt.toFixed(3)}deg`);
    terminal.style.setProperty('--article-cover-motion-blur', `${blur.toFixed(2)}px`);
    terminal.style.setProperty('--article-cover-motion-brightness', brightness.toFixed(3));
  }

  function resetMotion() {
    terminal.style.removeProperty('--article-cover-motion-y');
    terminal.style.removeProperty('--article-cover-motion-scale');
    terminal.style.removeProperty('--article-cover-motion-tilt');
    terminal.style.removeProperty('--article-cover-motion-blur');
    terminal.style.removeProperty('--article-cover-motion-brightness');
  }

  function measure() {
    const terminalTop = terminal.getBoundingClientRect().top + globalThis.scrollY;
    const viewportLead = globalThis.innerHeight * 0.42;

    startY = Math.max(0, terminalTop - viewportLead);
    travel = Math.max(hero.offsetHeight * 1.15, 360);
  }

  function update() {
    frame = 0;

    if (!mobileMedia.matches || reducedMotionMedia.matches) {
      resetMotion();
      return;
    }

    const progress = clamp((globalThis.scrollY - startY) / travel, 0, 1);
    setMotion(progress);
  }

  function requestUpdate() {
    if (frame) return;
    frame = globalThis.requestAnimationFrame(update);
  }

  function refresh() {
    measure();
    requestUpdate();
  }

  mobileMedia.addEventListener?.('change', refresh);
  reducedMotionMedia.addEventListener?.('change', refresh);
  globalThis.addEventListener('resize', refresh, { passive: true });
  globalThis.addEventListener('scroll', requestUpdate, { passive: true });

  measure();
  update();
})();
