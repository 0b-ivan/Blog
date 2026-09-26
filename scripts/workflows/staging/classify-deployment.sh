#!/usr/bin/env bash
set -euo pipefail

if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  echo "build_images=true" >> "$GITHUB_OUTPUT"
  echo "gitops_only=false" >> "$GITHUB_OUTPUT"
  echo 'Manual staging deployment: rebuild images and verify the published version.'
  exit 0
fi

git diff --name-only "$EVENT_BEFORE" "$EVENT_SHA" > /tmp/staging-deploy-files.txt
echo 'Staging deployment-relevant changes:'
cat /tmp/staging-deploy-files.txt

build_images=false
while IFS= read -r file; do
  case "$file" in
    infra/kubernetes/base/*|infra/kubernetes/base/**/*|infra/kubernetes/staging/*|infra/kubernetes/staging/**/*|infra/kubernetes/production/*|infra/kubernetes/production/**/*|scripts/verify-staging-scaling.sh|scripts/verify-production-k8s.sh|.github/workflows/*|.github/workflows/**/*|docs/*|docs/**/*|tests/*|tests/**/*|README.md|CONTRIBUTING.md)
      ;;
    *)
      build_images=true
      ;;
  esac
done < /tmp/staging-deploy-files.txt

if [ "$build_images" = true ]; then
  echo "gitops_only=false" >> "$GITHUB_OUTPUT"
  echo 'Application/content change detected: build new images.'
else
  echo "gitops_only=true" >> "$GITHUB_OUTPUT"
  echo 'GitOps-only change detected: reuse currently pinned images.'
fi
echo "build_images=$build_images" >> "$GITHUB_OUTPUT"
