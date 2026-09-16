#!/usr/bin/env bash
set -euo pipefail

kubectl create namespace cloudflare --dry-run=client -o yaml | kubectl apply -f -

read -r -s CLOUDFLARE_TUNNEL_TOKEN
export CLOUDFLARE_TUNNEL_TOKEN

kubectl -n cloudflare create secret generic cloudflared-token \
  --from-literal=token="$CLOUDFLARE_TUNNEL_TOKEN"

unset CLOUDFLARE_TUNNEL_TOKEN
