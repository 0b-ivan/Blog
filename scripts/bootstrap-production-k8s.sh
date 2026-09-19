#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-blog-production}"
SECRET_NAME="${SECRET_NAME:-ghcr-pull}"
FLUX_NAMESPACE="${FLUX_NAMESPACE:-flux-system}"
FLUX_KUSTOMIZATION="${FLUX_KUSTOMIZATION:-blog-production}"

kubectl apply -f infra/kubernetes/production/namespace.yaml >/dev/null

if ! kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Missing Secret: $NAMESPACE/$SECRET_NAME

Create it with a minimal GHCR credential that only needs read:packages.
Do not paste the token into chat or commit it to Git.

Example:
  export GHCR_READ_TOKEN='<token>'
  kubectl -n $NAMESPACE create secret docker-registry $SECRET_NAME \
    --docker-server=ghcr.io \
    --docker-username=0b-ivan \
    --docker-password="$GHCR_READ_TOKEN"
  unset GHCR_READ_TOKEN

Then run this script again.
EOF
  exit 2
fi

echo "Secret $NAMESPACE/$SECRET_NAME exists."
echo "Resuming Flux Kustomization $FLUX_NAMESPACE/$FLUX_KUSTOMIZATION ..."

flux resume kustomization "$FLUX_KUSTOMIZATION" -n "$FLUX_NAMESPACE"
flux reconcile source git flux-system -n "$FLUX_NAMESPACE"
flux reconcile kustomization "$FLUX_KUSTOMIZATION" -n "$FLUX_NAMESPACE"

kubectl -n "$NAMESPACE" rollout status deployment/search --timeout=300s
kubectl -n "$NAMESPACE" rollout status deployment/blog --timeout=180s

./scripts/verify-production-k8s.sh

echo
echo "Internal K3s production is healthy."
echo "Public production traffic is still unchanged on Hetzner."
