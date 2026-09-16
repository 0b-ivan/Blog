#!/usr/bin/env bash
set -euo pipefail

: "${REPOSITORY:?REPOSITORY is required}"
: "${COMMIT_SHA:?COMMIT_SHA is required}"

for attempt in 1 2 3 4 5; do
  count=$(gh api \
    -H "Accept: application/vnd.github+json" \
    "/repos/${REPOSITORY}/commits/${COMMIT_SHA}/pulls" \
    --jq '[.[] | select(.merged_at != null and .base.ref == "staging")] | length')

  if [ "$count" -ge 1 ]; then
    echo 'Staging commit is associated with a merged pull request.'
    exit 0
  fi

  [ "$attempt" -eq 5 ] || sleep 3
done

echo 'Refusing staging deployment: commit is not associated with a merged PR into staging.' >&2
exit 1
