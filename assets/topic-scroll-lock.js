(() => {
  const topicsList = document.getElementById('topics-list');
  if (!topicsList) {
    return;
  }

  topicsList.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-topic]');
      if (!button) {
        return;
      }

      const topBeforeRender = topicsList.getBoundingClientRect().top;

      window.requestAnimationFrame(() => {
        const topAfterRender = topicsList.getBoundingClientRect().top;
        const offset = topAfterRender - topBeforeRender;

        if (Math.abs(offset) > 0.5) {
          window.scrollBy(0, offset);
        }
      });
    },
    true
  );
})();
