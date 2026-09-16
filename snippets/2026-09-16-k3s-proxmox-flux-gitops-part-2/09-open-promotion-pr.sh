#!/usr/bin/env bash
set -euo pipefail

: "${REPOSITORY:?REPOSITORY is required}"
: "${BUILD_VERSION:?BUILD_VERSION is required}"
: "${VERIFIED_SHA:?VERIFIED_SHA is required}"
PROMOTION_BRANCH="${PROMOTION_BRANCH:-promotion/staging-verified}"

body="$(printf '%s\n\n%s\n%s\n\n%s\n' \
  "Staging deployment \`${BUILD_VERSION}\` is online and passed the public smoke check at https://staging-blog.obivan.org." \
  "Verified GitOps commit: \`${VERIFIED_SHA}\`" \
  "Promotion branch: \`${PROMOTION_BRANCH}\`" \
  'This PR promotes only the latest successfully verified staging candidate to `main`. The promotion branch is advanced only after the public staging gate succeeds. Merge remains manual so production is never promoted automatically.')"

existing="$(gh pr list \
  --repo "$REPOSITORY" \
  --state open \
  --base main \
  --head "$PROMOTION_BRANCH" \
  --json number \
  --jq '.[0].number // empty')"

if [ -n "$existing" ]; then
  gh api \
    --method PATCH \
    "/repos/${REPOSITORY}/pulls/${existing}" \
    -f body="$body" >/dev/null
  echo "Updated production promotion PR #${existing} to verified candidate ${VERIFIED_SHA}."
  exit 0
fi

gh pr create \
  --repo "$REPOSITORY" \
  --base main \
  --head "$PROMOTION_BRANCH" \
  --title 'promote: verified staging to production' \
  --body "$body"
