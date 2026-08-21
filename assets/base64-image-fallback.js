/* global document, fetch, atob, Blob, URL */

(() => {
  const selector = 'img[src^="/assets/posts/rechtschreib-pipeline/"][src$=".webp"]';

  async function recover(image) {
    if (image.dataset.base64Recovery === 'done' || image.dataset.base64Recovery === 'running') {
      return;
    }

    image.dataset.base64Recovery = 'running';

    try {
      const response = await fetch(image.getAttribute('src'), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const encoded = (await response.text()).replace(/\s+/g, '');
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const isWebP =
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';

      if (!isWebP) {
        throw new Error('decoded payload is not WebP');
      }

      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      image.dataset.base64Recovery = 'done';
      image.src = objectUrl;
      image.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });
    } catch (error) {
      image.dataset.base64Recovery = 'failed';
      console.error(`Could not recover ${image.getAttribute('src')}:`, error);
    }
  }

  document.querySelectorAll(selector).forEach((image) => {
    image.addEventListener('error', () => recover(image), { once: true });

    if (image.complete && image.naturalWidth === 0) {
      recover(image);
    }
  });
})();
