#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"
STAGING_URL="${STAGING_URL:-https://staging-blog.obivan.org}"
DEPLOY_ID="${GITHUB_SHA:-manual}"

echo "Waiting for ${EXPECTED_VERSION} on ${STAGING_URL}"

for attempt in $(seq 1 60); do
  health="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' \
    "${STAGING_URL}/healthz?deploy=${DEPLOY_ID}" 2>/dev/null || true)"
  build_info="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' \
    "${STAGING_URL}/build-info.json?deploy=${DEPLOY_ID}" 2>/dev/null || true)"
  version="$(printf '%s' "$build_info" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", ""))' 2>/dev/null || true)"

  if [ "$health" = 'ok' ] && [ "$version" = "$EXPECTED_VERSION" ]; then
    page="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' \
      "${STAGING_URL}/?deploy=${DEPLOY_ID}")"
    printf '%s' "$page" | grep -q 'data-environment="staging"'
    echo "Staging is serving ${EXPECTED_VERSION}."
    exit 0
  fi

  echo "Attempt ${attempt}/60: health='${health:-unavailable}', version='${version:-unavailable}'"
  sleep 10
done

echo "Timed out waiting for ${EXPECTED_VERSION} to be published on staging." >&2
exit 1
