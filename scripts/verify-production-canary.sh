#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${TARGET_URL:-https://k8s-blog.obivan.org}"

retry_get() {
  local path="$1"
  local expected_status="${2:-200}"
  local body
  for attempt in $(seq 1 15); do
    body="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "${TARGET_URL}${path}" 2>/dev/null || true)"
    if [ -n "$body" ]; then
      printf '%s' "$body"
      return 0
    fi
    echo "GET retry ${attempt}/15: ${TARGET_URL}${path}" >&2
    sleep 2
  done
  return 1
}

health="$(retry_get /healthz)"
if [ "$health" != "ok" ]; then
  echo "Unexpected /healthz response: $health" >&2
  exit 1
fi

home="$(retry_get /)"
if printf '%s' "$home" | grep -q 'data-environment="staging"'; then
  echo "Refusing canary: target is serving the staging runtime." >&2
  exit 1
fi

retry_get /archive >/dev/null
retry_get /grep >/dev/null

search_response="$(
  curl -fsS --max-time 20     -X POST     -H 'Content-Type: application/json'     --data '{"q":"Docker","limit":1}'     "${TARGET_URL}/api/search"
)"

printf '%s' "$search_response" | python3 -c '
import json, sys
data = json.load(sys.stdin)
results = data.get("results")
if not isinstance(results, list) or not results:
    raise SystemExit("Kernel Grep returned no result for Docker")
'

echo "Public K3s production canary passed: $TARGET_URL"
