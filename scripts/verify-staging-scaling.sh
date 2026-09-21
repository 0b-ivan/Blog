#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-blog-staging}"
DEPLOYMENT="${DEPLOYMENT:-blog}"
SERVICE="${SERVICE:-blog}"
EXPECTED_REPLICAS="${EXPECTED_REPLICAS:-1}"
STAGING_URL="${STAGING_URL:-https://staging-blog.obivan.org}"

available="$(kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" -o jsonpath='{.status.availableReplicas}')"
available="${available:-0}"

if [ "$available" -ne "$EXPECTED_REPLICAS" ]; then
  echo "Expected $EXPECTED_REPLICAS available replicas, got $available." >&2
  kubectl -n "$NAMESPACE" get pods -l app=blog -o wide >&2 || true
  exit 1
fi

ready_endpoints="$(
  kubectl -n "$NAMESPACE" get endpointslice     -l "kubernetes.io/service-name=$SERVICE"     -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}'     | sed '/^$/d'     | sort -u     | wc -l     | tr -d ' '
)"

if [ "$ready_endpoints" -ne "$EXPECTED_REPLICAS" ]; then
  echo "Expected $EXPECTED_REPLICAS ready Service endpoints, got $ready_endpoints." >&2
  kubectl -n "$NAMESPACE" get endpointslice -l "kubernetes.io/service-name=$SERVICE" -o wide >&2 || true
  exit 1
fi

health="$(curl -fsS --max-time 10 "$STAGING_URL/healthz")"
if [ "$health" != "ok" ]; then
  echo "Public staging health check returned: $health" >&2
  exit 1
fi

echo "Scaling check passed: $available replicas, $ready_endpoints ready endpoints, public /healthz=ok."
