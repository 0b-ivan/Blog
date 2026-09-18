#!/usr/bin/env bash
set -euo pipefail

: "${VERIFIED_SHA:?VERIFIED_SHA is required}"
PROMOTION_BRANCH="${PROMOTION_BRANCH:-promotion/staging-verified}"

git fetch origin staging
if ! git merge-base --is-ancestor "$VERIFIED_SHA" origin/staging; then
  echo "Refusing to publish promotion candidate: ${VERIFIED_SHA} is not part of current staging history." >&2
  exit 1
fi

git push origin "${VERIFIED_SHA}:refs/heads/${PROMOTION_BRANCH}"
echo "Verified promotion candidate ${PROMOTION_BRANCH} -> ${VERIFIED_SHA}"
