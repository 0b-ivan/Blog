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

function resolvePostCover(post) {
  return {
    image: normalizeCoverPath(post && post.coverImage),
    focus: normalizeCoverFocus(post && post.coverFocus),
    credit: String((post && post.coverCredit) || '').trim(),
    creditUrl: String((post && post.coverCreditUrl) || '').trim()
  };
}

module.exports = { normalizeCoverPath, normalizeCoverFocus, resolvePostCover };
