#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-blog-production}"
EXPECTED_BLOG_REPLICAS="${EXPECTED_BLOG_REPLICAS:-3}"
EXPECTED_SEARCH_REPLICAS="${EXPECTED_SEARCH_REPLICAS:-1}"

deployment_available() {
  kubectl -n "$NAMESPACE" get deployment "$1" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true
}

ready_endpoints() {
  kubectl -n "$NAMESPACE" get endpointslice     -l "kubernetes.io/service-name=$1"     -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}'     2>/dev/null     | sed '/^$/d'     | sort -u     | wc -l     | tr -d ' '
}

blog_available="$(deployment_available blog)"
search_available="$(deployment_available search)"
blog_available="${blog_available:-0}"
search_available="${search_available:-0}"

if [ "$blog_available" -ne "$EXPECTED_BLOG_REPLICAS" ]; then
  echo "Expected $EXPECTED_BLOG_REPLICAS available blog replicas, got $blog_available." >&2
  kubectl -n "$NAMESPACE" get pods -o wide >&2 || true
  exit 1
fi

if [ "$search_available" -ne "$EXPECTED_SEARCH_REPLICAS" ]; then
  echo "Expected $EXPECTED_SEARCH_REPLICAS available search replicas, got $search_available." >&2
  kubectl -n "$NAMESPACE" get pods -o wide >&2 || true
  exit 1
fi

blog_endpoints="$(ready_endpoints blog)"
search_endpoints="$(ready_endpoints search)"

if [ "$blog_endpoints" -ne "$EXPECTED_BLOG_REPLICAS" ]; then
  echo "Expected $EXPECTED_BLOG_REPLICAS ready blog endpoints, got $blog_endpoints." >&2
  exit 1
fi

if [ "$search_endpoints" -ne "$EXPECTED_SEARCH_REPLICAS" ]; then
  echo "Expected $EXPECTED_SEARCH_REPLICAS ready search endpoints, got $search_endpoints." >&2
  exit 1
fi

health="$(
  kubectl -n "$NAMESPACE" exec deploy/blog --     /nodejs/bin/node -e     "fetch('http://blog/healthz').then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))"
)"

if [ "$health" != "ok" ]; then
  echo "Internal production Service health check returned: $health" >&2
  exit 1
fi

echo "Production K3s check passed: $blog_available blog replicas, $search_available search replica, Service /healthz=ok."
