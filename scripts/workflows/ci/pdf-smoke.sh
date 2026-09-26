#!/usr/bin/env bash
set -euo pipefail

preferred_slugs=(
  2026-09-20-chaos-engineering-chaos-monkey-kubernetes
  2026-09-24-pac-man-puck-man-paku-paku
)
smoke_slugs=()

add_slug_if_published() {
  local slug="$1"
  local post="posts/${slug}.md"

  [ -f "$post" ] || return 0
  grep -Eq '^status:[[:space:]]*publish[[:space:]]*$' "$post" || return 0

  for existing in "${smoke_slugs[@]:-}"; do
    [ "$existing" = "$slug" ] && return 0
  done

  smoke_slugs+=("$slug")
}

for slug in "${preferred_slugs[@]}"; do
  add_slug_if_published "$slug"
done

while IFS= read -r post; do
  [ "${#smoke_slugs[@]}" -ge 2 ] && break
  slug="$(basename "$post" .md)"
  add_slug_if_published "$slug"
done < <(find posts -maxdepth 1 -type f -name '*.md' -print | sort)

if [ "${#smoke_slugs[@]}" -lt 2 ]; then
  echo "Need at least two published posts for the LaTeX PDF smoke test; found ${#smoke_slugs[@]}." >&2
  exit 1
fi

printf 'LaTeX PDF smoke slugs: %s\n' "${smoke_slugs[*]}"

for slug in "${smoke_slugs[@]:0:2}"; do
  output="/tmp/kernel-notes-${slug}.pdf"
  if ! curl -fsS --max-time 150     "http://127.0.0.1:8080/download/${slug}.pdf"     -o "$output"; then
    echo "LaTeX PDF smoke test failed for ${slug}; renderer logs follow:" >&2
    docker compose logs --no-color --tail=300 pdf blog || true
    exit 1
  fi
  test "$(head -c 5 "$output")" = '%PDF-' || {
    docker compose logs --no-color --tail=300 pdf blog || true
    exit 1
  }
  test "$(wc -c < "$output")" -gt 10000 || {
    docker compose logs --no-color --tail=300 pdf blog || true
    exit 1
  }
  curl -fsS http://127.0.0.1:8080/healthz >/dev/null || {
    docker compose logs --no-color --tail=300 pdf blog || true
    exit 1
  }
done
