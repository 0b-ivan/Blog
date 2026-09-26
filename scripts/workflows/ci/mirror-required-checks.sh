#!/usr/bin/env bash
set -euo pipefail

pr_json="$(gh api "/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}")"
pr_state="$(printf '%s' "$pr_json" | jq -r '.state')"
pr_base="$(printf '%s' "$pr_json" | jq -r '.base.ref')"
pr_head_sha="$(printf '%s' "$pr_json" | jq -r '.head.sha')"
merge_sha="$(printf '%s' "$pr_json" | jq -r '.merge_commit_sha // empty')"

test "$pr_state" = open
test "$pr_base" = main

if [ "$pr_head_sha" != "$DISPATCH_SHA" ]; then
  echo "Refusing to mirror stale results: dispatched SHA ${DISPATCH_SHA} != PR head ${pr_head_sha}." >&2
  exit 1
fi

if [ -z "$merge_sha" ]; then
  echo 'GitHub has not produced a synthetic merge commit for the PR.' >&2
  exit 1
fi

publish_check() {
  local name="$1"
  local result="$2"
  local conclusion=failure

  if [ "$result" = success ]; then
    conclusion=success
  fi

  gh api     --method POST     -H 'Accept: application/vnd.github+json'     "/repos/${GITHUB_REPOSITORY}/check-runs"     -f name="$name"     -f head_sha="$merge_sha"     -f status=completed     -f conclusion="$conclusion"     -f details_url="$RUN_URL" >/dev/null

  echo "Mirrored ${name}=${conclusion} to ${merge_sha}."
}

publish_check checks "$CHECKS_RESULT"
publish_check 'Local assets' "$LOCAL_ASSETS_RESULT"

if [ "$CHECKS_RESULT" != success ] || [ "$LOCAL_ASSETS_RESULT" != success ]; then
  echo 'One or more required checks failed; mirrored failure to the PR merge commit.' >&2
  exit 1
fi
