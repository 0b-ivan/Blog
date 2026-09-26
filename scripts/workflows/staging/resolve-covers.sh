#!/usr/bin/env bash
set -euo pipefail

test -n "$PIXABAY_API_KEY" || {
  echo 'PIXABAY_API_KEY is required when a published article needs a generated cover.' >&2
  exit 1
}

mkdir -p /tmp/cover-reports

while IFS= read -r post; do
  [ -n "$post" ] || continue
  echo "Collecting cover candidates for $post"
  slug="$(basename "$post" .md)"
  npm run covers:resolve -- "$post" --preview --report "/tmp/cover-reports/${slug}.json"
done < /tmp/pixabay-cover-posts.txt

node scripts/rerank-cover-candidates-e5.js   --reports-dir /tmp/cover-reports   --posts-dir posts   --cache-dir "$RAG_MODEL_CACHE"

node scripts/select-diverse-cover-candidates.js   --reports-dir /tmp/cover-reports   --output /tmp/cover-selection.json   --selection-list /tmp/cover-selection.list

selected_count="$(wc -l < /tmp/cover-selection.list | tr -d ' ')"
requested_count="$(wc -l < /tmp/pixabay-cover-posts.txt | tr -d ' ')"
if [ "$selected_count" -ne "$requested_count" ]; then
  echo "Refusing automatic cover fallback: selected ${selected_count}/${requested_count} posts after semantic guardrails." >&2
  cat /tmp/cover-selection.json >&2
  exit 1
fi

while IFS='|' read -r post image_id semantic_score; do
  [ -n "$post" ] || continue
  echo "Applying semantic cover $image_id for $post (score $semantic_score)"
  npm run covers:resolve -- "$post" --select-id "$image_id" --score "$semantic_score"
done < /tmp/cover-selection.list

git diff --check
npm run posts:validate-meta
npx vitest run tests/cover-backfill.test.js tests/pixabay-cover.test.js tests/cover-diversity.test.js tests/cover-semantic-rerank.test.js tests/cover-review.test.js tests/ebook-export.test.js tests/server.test.js
