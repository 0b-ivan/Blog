#!/usr/bin/env bash
set -euo pipefail

test -n "$VERIFIED_SHA"

git fetch origin staging
if ! git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging; then
  echo "Refusing to publish promotion candidate: ${VERIFIED_SHA} is not part of current staging history." >&2
  exit 1
fi

current_promotion_sha="$(
  git ls-remote --heads origin "refs/heads/${PROMOTION_BRANCH}" |
    awk 'NR == 1 { print $1 }'
)"

git push   --force-with-lease="refs/heads/${PROMOTION_BRANCH}:${current_promotion_sha}"   origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"

echo "Verified promotion candidate ${PROMOTION_BRANCH} -> ${VERIFIED_SHA}"
