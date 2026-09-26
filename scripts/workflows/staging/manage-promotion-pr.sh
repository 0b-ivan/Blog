#!/usr/bin/env bash
set -euo pipefail

if [ -n "${BUILD_VERSION:-}" ]; then
  validation_summary="Staging deployment \`${BUILD_VERSION}\` is online and passed the public smoke check at https://staging-blog.obivan.org."
else
  validation_summary="Staging control-plane/GitOps state \`${VERIFIED_SHA}\` passed the public availability gate at https://staging-blog.obivan.org without rebuilding application images."
fi

body="$(printf '%s\n\n%s\n%s\n\n%s\n'   "$validation_summary"   "Verified GitOps commit: \`${VERIFIED_SHA}\`"   "Promotion branch: \`${PROMOTION_BRANCH}\`"   'This PR promotes only the latest successfully verified staging candidate to `main`. The promotion branch is advanced only after the applicable public staging gate succeeds. Merge remains manual so production is never promoted automatically.')"

if [ -d /tmp/cover-reports ] && find /tmp/cover-reports -maxdepth 1 -name '*.json' -print -quit | grep -q .; then
  cover_review_file="$(mktemp)"
  node scripts/render-cover-review.js     --reports-dir /tmp/cover-reports     --repository "$REPOSITORY"     --commit "$VERIFIED_SHA" > "$cover_review_file"
  body="$(printf '%s\n\n%s' "$body" "$(cat "$cover_review_file")")"
fi

existing="$(gh pr list   --repo "$REPOSITORY"   --state open   --base main   --head "$PROMOTION_BRANCH"   --json number   --jq '.[0].number // empty')"

if [ -n "$existing" ]; then
  gh api     --method PATCH     "/repos/${REPOSITORY}/pulls/${existing}"     -f body="$body" >/dev/null
  echo "Updated production promotion PR #${existing} to verified candidate ${VERIFIED_SHA}."
  exit 0
fi

gh pr create   --repo "$REPOSITORY"   --base main   --head "$PROMOTION_BRANCH"   --title 'promote: verified staging to production'   --body "$body"
