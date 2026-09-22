(() => {
  const mobile = window.matchMedia('(max-width: 620px)');

  document.querySelectorAll('.site-header').forEach((header) => {
    const nav = header.querySelector('.main-nav');
    if (!nav) return;

    let interacted = false;

    const update = () => {
      const overflow = mobile.matches && nav.scrollWidth > nav.clientWidth + 4;
      const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4;

      header.classList.toggle('has-nav-overflow', overflow);
      header.classList.toggle('nav-scroll-cue', overflow && !interacted && !atEnd);
    };

    nav.addEventListener('scroll', () => {
      if (nav.scrollLeft > 4) interacted = true;
      update();
    }, { passive: true });

    mobile.addEventListener?.('change', update);
    window.addEventListener('resize', update, { passive: true });
    requestAnimationFrame(update);
  });
})();
