#!/usr/bin/env bash
set -euo pipefail

kubectl -n blog-staging create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username="${GITHUB_USER}" \
  --docker-password="${GHCR_TOKEN}"
