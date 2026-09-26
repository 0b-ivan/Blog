#!/usr/bin/env bash
set -euo pipefail

if [ "$GENERATED_COVERS" = "true" ]; then
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

  while IFS= read -r post; do
    git add "$post"
  done < /tmp/pixabay-cover-posts.txt
  git add assets/covers assets/css/article-covers.css

  if ! git diff --cached --quiet; then
    git commit -m "chore(covers): resolve Pixabay covers for ${GITHUB_SHA::12} [skip ci]"

    pushed=false
    for attempt in 1 2 3; do
      git fetch origin staging

      if ! git rebase origin/staging; then
        git rebase --abort || true
        echo 'Refusing to overwrite newer staging content after a cover-generation conflict.' >&2
        exit 1
      fi

      if git push origin HEAD:staging; then
        pushed=true
        break
      fi

      echo "Staging advanced during cover push (attempt ${attempt}/3); retrying."
      sleep "$((attempt * 2))"
    done

    if [ "$pushed" != true ]; then
      echo 'Failed to persist generated Pixabay covers after 3 attempts.' >&2
      exit 1
    fi
  fi
fi

echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
echo "Staging source SHA: $(git rev-parse HEAD)"
