#!/usr/bin/env bash
set -euo pipefail

promotion_sha="$(
  git ls-remote --heads origin "refs/heads/${PROMOTION_BRANCH}" |
    awk 'NR == 1 { print $1 }'
)"

if [ -z "$promotion_sha" ]; then
  echo 'No promotion branch exists yet; nothing to validate.'
  exit 0
fi

promotion_pr="$(
  gh pr list     --repo "$REPOSITORY"     --state open     --base main     --head "$PROMOTION_BRANCH"     --json number     --jq '.[0].number // empty'
)"

if [ -z "$promotion_pr" ]; then
  echo 'No open production promotion PR exists; nothing to validate.'
  exit 0
fi

gh workflow run ci.yml   --repo "$REPOSITORY"   --ref "$PROMOTION_BRANCH"   -f pr_number="$promotion_pr"

echo "Triggered PR Checks for promotion PR #${promotion_pr} at ${promotion_sha}."
