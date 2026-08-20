(() => {
  const form = document.querySelector('[data-newsletter-form]');
  const unavailable = document.querySelector('[data-newsletter-unavailable]');
  if (!form) {
    return;
  }

  const username = String(window.KERNEL_NOTES_NEWSLETTER?.buttondownUsername || '').trim();
  if (!username) {
    form.hidden = true;
    if (unavailable) {
      unavailable.hidden = false;
    }
    return;
  }

  form.action = `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(username)}`;
  form.hidden = false;
  if (unavailable) {
    unavailable.hidden = true;
  }
})();
