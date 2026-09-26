#!/usr/bin/env bash
set -euo pipefail

if [ "$BUILD_IMAGES" = true ]; then
  echo 'Images are in GHCR and the staging GitOps manifest is updated.'
  echo 'The public staging build was verified before promotion/staging-verified was advanced.'
  echo 'The production promotion PR targets the verified candidate branch and still requires a manual merge.'
else
  echo 'Control-plane/GitOps-only change: existing images were reused.'
  echo 'Public staging availability was verified and the promotion pointer was advanced to the current staging history.'
  echo 'Flux reconciles infra/kubernetes/staging from the staging branch.'
fi
