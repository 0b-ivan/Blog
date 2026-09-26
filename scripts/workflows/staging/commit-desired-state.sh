#!/usr/bin/env bash
set -euo pipefail

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add infra/kubernetes/staging/kustomization.yaml

if git diff --cached --quiet; then
  echo 'No generated GitOps image-pin change to commit.'
else
  git commit -m "chore(staging): deploy ${DEPLOY_SHA} [skip ci]"

  pushed=false
  for attempt in 1 2 3; do
    git fetch origin staging

    if ! git rebase origin/staging; then
      git rebase --abort || true
      echo 'Refusing to overwrite a newer staging GitOps change after a rebase conflict.' >&2
      exit 1
    fi

    if git push origin HEAD:staging; then
      pushed=true
      break
    fi

    echo "Staging advanced during desired-state push (attempt ${attempt}/3); retrying."
    sleep "$((attempt * 2))"
  done

  if [ "$pushed" != true ]; then
    echo 'Failed to publish the generated staging GitOps state after 3 attempts.' >&2
    exit 1
  fi
fi

GITOPS_SHA="$(git rev-parse HEAD)"
echo "gitops_sha=${GITOPS_SHA}" >> "$GITHUB_OUTPUT"
echo "GitOps state to verify: ${GITOPS_SHA}"
