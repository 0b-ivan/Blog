function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  const text = cleanText(value);
  if (!maxLength || text.length <= maxLength) return text;

  const slice = text.slice(0, Math.max(1, maxLength - 1));
  const boundary = slice.lastIndexOf(' ');
  const shortened = boundary >= Math.floor(maxLength * 0.6)
    ? slice.slice(0, boundary)
    : slice;
  return `${shortened.trim()}…`;
}

function resolveCoverTitle(post) {
  return cleanText(
    post?.coverTitle
      || post?.cover_title
      || post?.title
      || 'Kernel Notes'
  );
}

function resolveCoverSubtitle(post, options = {}) {
  const explicit = cleanText(post?.coverSubtitle || post?.cover_subtitle);
  if (explicit) return explicit;

  if (options.allowExcerptFallback === false) return '';

  return truncateText(post?.excerpt || '', options.maxLength || 150);
}

module.exports = {
  cleanText,
  resolveCoverSubtitle,
  resolveCoverTitle,
  truncateText
};
