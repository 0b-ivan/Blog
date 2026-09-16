#!/usr/bin/env bash
set -euo pipefail

BLOG_IP="$(sudo k3s kubectl -n blog-staging get svc blog -o jsonpath='{.spec.clusterIP}')"
curl -fsS "http://${BLOG_IP}/healthz"

sudo k3s kubectl -n blog-staging run curl-test \
  --image=curlimages/curl \
  --restart=Never \
  --attach \
  --rm \
  -- curl -fsS http://blog/healthz
