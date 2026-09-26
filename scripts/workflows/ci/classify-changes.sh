#!/usr/bin/env bash
set -euo pipefail

if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  echo "heavy=true" >> "$GITHUB_OUTPUT"
  echo "security=true" >> "$GITHUB_OUTPUT"
  echo "semantic=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

git diff --name-only "$PR_BASE_SHA"...HEAD > /tmp/changed-files.txt
echo "Changed files:"
cat /tmp/changed-files.txt

heavy=false
security=false
semantic=false

while IFS= read -r file; do
  case "$file" in
    package.json|package-lock.json|rag/package.json|rag/package-lock.json|Dockerfile|Dockerfile.search|Dockerfile.status|Dockerfile.chaos|Dockerfile.pdf|docker-compose.yml|docker-compose.prod.yml|ops/*/docker-compose.yml)
      security=true
      ;;
  esac

  case "$file" in
    .github/workflows/ci.yml|scripts/workflows/ci/*)
      heavy=true
      security=true
      ;;
  esac

  case "$file" in
    posts/*|archive/*|rag/*)
      semantic=true
      ;;
  esac

  case "$file" in
    posts/*|archive/*|snippets/*|assets/posts/*|config/proofread-words.txt|cspell.json|scripts/spellcheck-posts.js|scripts/proofread-posts.js|scripts/list-missing-cover-posts.js|scripts/render-cover-review.js|scripts/rerank-cover-candidates-e5.js|scripts/resolve-pixabay-cover.js|scripts/select-diverse-cover-candidates.js|tests/cover-backfill.test.js|tests/cover-diversity.test.js|tests/cover-review.test.js|tests/cover-semantic-rerank.test.js|tests/pixabay-cover.test.js|README*|docs/*|.github/workflows/*)
      ;;
    *)
      heavy=true
      ;;
  esac
done < /tmp/changed-files.txt

echo "heavy=$heavy" >> "$GITHUB_OUTPUT"
echo "security=$security" >> "$GITHUB_OUTPUT"
echo "semantic=$semantic" >> "$GITHUB_OUTPUT"
echo "Classification: heavy=$heavy security=$security semantic=$semantic"
