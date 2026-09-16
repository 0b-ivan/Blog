#!/usr/bin/env bash
set -euo pipefail

sudo k3s kubectl -n cloudflare run curl-test \
  --image=curlimages/curl \
  --restart=Never \
  --attach \
  --rm \
  -- curl -fsS http://blog.blog-staging.svc.cluster.local/healthz
