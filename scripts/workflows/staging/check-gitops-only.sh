#!/usr/bin/env bash
set -euo pipefail

echo 'GitOps-only change: no image rebuild is required.'
echo 'Waiting briefly for Flux reconciliation before checking public availability.'
sleep 30

for attempt in $(seq 1 30); do
  health="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "${STAGING_URL}/healthz?gitops=${GITHUB_SHA}" 2>/dev/null || true)"
  page="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "${STAGING_URL}/?gitops=${GITHUB_SHA}" 2>/dev/null || true)"

  if [ "$health" = 'ok' ] && printf '%s' "$page" | grep -q 'data-environment="staging"'; then
    echo 'Public staging is healthy after the GitOps-only change.'
    echo 'Note: this proves public availability, not the exact in-cluster replica count.'
    exit 0
  fi

  echo "Attempt ${attempt}/30: health='${health:-unavailable}'"
  sleep 10
done

echo 'Public staging did not become healthy after the GitOps-only change.' >&2
exit 1
