function normalizeCoverPath(value) {
  const cover = String(value || '').trim();
  if (!cover.startsWith('/assets/covers/')) return '';
  if (!/^[a-zA-Z0-9_./-]+$/.test(cover)) return '';
  return cover;
}

function normalizeCoverFocus(value) {
  const focus = String(value || '').trim().toLowerCase();
  return ['center', 'top', 'bottom', 'left', 'right'].includes(focus) ? focus : 'center';
}

const PHOTO_COVER_OVERLAY = 'linear-gradient(180deg, rgba(4, 25, 27, 0.30) 0%, rgba(3, 25, 28, 0.48) 52%, rgba(8, 17, 25, 0.78) 82%, var(--terminal-surface, #0c121b) 100%)';

function resolvePostCover(post) {
  return {
    image: normalizeCoverPath(post && post.coverImage),
    focus: normalizeCoverFocus(post && post.coverFocus),
    credit: String((post && post.coverCredit) || '').trim(),
    creditUrl: String((post && post.coverCreditUrl) || '').trim()
  };
}

function articleCoverStyle(post) {
  const cover = resolvePostCover(post);
  if (!cover.image) return '';

  return [
    `--article-cover-image: url(${cover.image})`,
    `--article-cover-focus: ${cover.focus}`,
    `--article-cover-overlay: ${PHOTO_COVER_OVERLAY}`
  ].join('; ');
}

module.exports = {
  PHOTO_COVER_OVERLAY,
  articleCoverStyle,
  normalizeCoverPath,
  normalizeCoverFocus,
  resolvePostCover
};
