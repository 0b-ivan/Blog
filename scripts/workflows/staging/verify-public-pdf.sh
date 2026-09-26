#!/usr/bin/env bash
set -euo pipefail

output=/tmp/staging-pdf-smoke.pdf

echo 'Starting PDF preparation through the public API without holding a long Cloudflare request.'
accepted=false
for attempt in $(seq 1 24); do
  response="$(curl -fsS --max-time 10 -X POST     "${STAGING_URL}/api/pdf/${PDF_SMOKE_SLUG}/prepare?deploy=${GITHUB_SHA}" 2>/dev/null || true)"
  ready="$(printf '%s' "$response" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("ready", False)).lower())' 2>/dev/null || true)"
  preparing="$(printf '%s' "$response" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("preparing", False)).lower())' 2>/dev/null || true)"

  if [ "$ready" = true ] || [ "$preparing" = true ]; then
    accepted=true
    echo "PDF preparation accepted on attempt ${attempt}."
    break
  fi

  echo "PDF service not ready for preparation yet (attempt ${attempt}/24)."
  sleep 5
done

test "$accepted" = true

echo 'Waiting for the cached PDF to become ready.'
pdf_ready=false
for attempt in $(seq 1 30); do
  state_file="$(mktemp)"
  status_code="$(curl -sS --max-time 10     -o "$state_file"     -w '%{http_code}'     "${STAGING_URL}/api/pdf/${PDF_SMOKE_SLUG}/status?deploy=${GITHUB_SHA}" || true)"
  state="$(cat "$state_file")"
  rm -f "$state_file"

  ready="$(printf '%s' "$state" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("ready", False)).lower())' 2>/dev/null || true)"
  preparing="$(printf '%s' "$state" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("preparing", False)).lower())' 2>/dev/null || true)"

  if [ "$status_code" = 200 ] && [ "$ready" = true ]; then
    pdf_ready=true
    echo "PDF cache is ready after ${attempt} status check(s)."
    break
  fi

  blog_health="$(curl -fsS --max-time 5 "${STAGING_URL}/healthz?pdf-status=${GITHUB_SHA}" 2>/dev/null || true)"
  echo "PDF state: http=${status_code:-000}, ready=${ready:-unknown}, preparing=${preparing:-unknown}, blog_health=${blog_health:-unavailable} (attempt ${attempt}/30)"

  if [ "$status_code" = 200 ] && [ "$preparing" = false ]; then
    echo 'PDF renderer is reachable but no render is active; requesting preparation again.'
    curl -fsS --max-time 10 -X POST       "${STAGING_URL}/api/pdf/${PDF_SMOKE_SLUG}/prepare?retry=${attempt}&deploy=${GITHUB_SHA}"       >/dev/null || true
  fi

  sleep 5
done

if [ "$pdf_ready" != true ]; then
  echo 'PDF cache did not become ready; final public diagnostics:' >&2
  curl -sS --max-time 10 -i "${STAGING_URL}/api/pdf/${PDF_SMOKE_SLUG}/status?diagnostic=${GITHUB_SHA}" >&2 || true
  curl -sS --max-time 10 -i "${STAGING_URL}/healthz?diagnostic=${GITHUB_SHA}" >&2 || true
  exit 1
fi

curl -fsS --max-time 20   "${STAGING_URL}/download/${PDF_SMOKE_SLUG}.pdf?deploy=${GITHUB_SHA}"   -o "$output"
test "$(head -c 5 "$output")" = '%PDF-'
test "$(wc -c < "$output")" -gt 10000
echo 'Public staging LaTeX PDF export is healthy and served from the prepared cache.'
