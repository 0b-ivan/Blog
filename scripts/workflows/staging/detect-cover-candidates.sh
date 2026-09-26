#!/usr/bin/env bash
set -euo pipefail

: > /tmp/pixabay-cover-posts.txt

git diff --name-only "$EVENT_BEFORE" "$EVENT_SHA" -- 'posts/*.md' |
  sort -u |
  while IFS= read -r post; do
    [ -f "$post" ] || continue

    status="$(sed -n 's/^[[:space:]]*status:[[:space:]]*//p' "$post" | head -n 1 | tr -d "\r\"'" | xargs || true)"
    case "${status,,}" in
      draft|archived)
        echo "Skipping $post because status=$status"
        continue
        ;;
    esac

    cover_value="$(sed -n 's/^[[:space:]]*cover_image:[[:space:]]*//p' "$post" | head -n 1 | tr -d '\r' | xargs || true)"
    case "$cover_value" in
      ""|'""'|"''"|null|~)
        echo "$post" >> /tmp/pixabay-cover-posts.txt
        continue
        ;;
    esac

    previous_post="$(git show "${EVENT_BEFORE}:$post" 2>/dev/null || true)"
    current_cover_brief="$(sed -n -E '/^[[:space:]]*(cover_query|cover_subject|cover_avoid|cover_intent):/p' "$post")"
    previous_cover_brief="$(printf '%s\n' "$previous_post" | sed -n -E '/^[[:space:]]*(cover_query|cover_subject|cover_avoid|cover_intent):/p')"

    if [ -n "$previous_post" ] && [ "$current_cover_brief" != "$previous_cover_brief" ]; then
      echo "Cover brief changed for $post; refreshing Pixabay cover"
      echo "$post" >> /tmp/pixabay-cover-posts.txt
    else
      echo "Keeping existing cover for $post"
    fi
  done

node scripts/list-missing-cover-posts.js --limit "$COVER_BACKFILL_LIMIT" > /tmp/pixabay-cover-backfill.txt
cat /tmp/pixabay-cover-backfill.txt >> /tmp/pixabay-cover-posts.txt
sort -u -o /tmp/pixabay-cover-posts.txt /tmp/pixabay-cover-posts.txt

count="$(wc -l < /tmp/pixabay-cover-posts.txt | tr -d ' ')"
if [ "$count" -gt 0 ]; then
  echo "needed=true" >> "$GITHUB_OUTPUT"
  echo "Automatic Pixabay cover resolution required for $count post(s):"
  cat /tmp/pixabay-cover-posts.txt
else
  echo "needed=false" >> "$GITHUB_OUTPUT"
  echo 'No changed or existing published post needs generated or refreshed cover resolution.'
fi
