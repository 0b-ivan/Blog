#!/usr/bin/env bash
set -euo pipefail

for cmd in base64 git kubectl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Fehlt: $cmd" >&2
    exit 1
  }
done

ROOT="$(git rev-parse --show-toplevel)"
KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

[[ -s "$KEY_FILE" ]] || {
  echo "Age-Key fehlt: $KEY_FILE" >&2
  exit 1
}

git -C "$ROOT" fetch origin staging

REMOTE_SYNC="$(git -C "$ROOT" show origin/staging:infra/kubernetes/staging/flux-system/gotk-sync.yaml)"
REMOTE_KUSTOMIZATION="$(git -C "$ROOT" show origin/staging:infra/kubernetes/staging/kustomization.yaml)"
REMOTE_GHCR="$(git -C "$ROOT" show origin/staging:infra/kubernetes/staging/secrets/ghcr-pull.sops.yaml)"
REMOTE_CLOUDFLARED="$(git -C "$ROOT" show origin/staging:infra/kubernetes/staging/secrets/cloudflared-token.sops.yaml)"

grep -q 'provider: sops' <<<"$REMOTE_SYNC" || {
  echo "origin/staging enthält noch keine Flux-SOPS-Decryption." >&2
  exit 1
}
grep -q 'name: sops-age' <<<"$REMOTE_SYNC" || {
  echo "origin/staging referenziert sops-age noch nicht." >&2
  exit 1
}
grep -q 'secrets/ghcr-pull.sops.yaml' <<<"$REMOTE_KUSTOMIZATION" || {
  echo "origin/staging referenziert ghcr-pull.sops.yaml noch nicht." >&2
  exit 1
}
grep -q 'secrets/cloudflared-token.sops.yaml' <<<"$REMOTE_KUSTOMIZATION" || {
  echo "origin/staging referenziert cloudflared-token.sops.yaml noch nicht." >&2
  exit 1
}
grep -q '^sops:' <<<"$REMOTE_GHCR"
grep -q 'ENC\[AES256_GCM' <<<"$REMOTE_GHCR"
grep -q '^sops:' <<<"$REMOTE_CLOUDFLARED"
grep -q 'ENC\[AES256_GCM' <<<"$REMOTE_CLOUDFLARED"

CLUSTER_KEY_B64="$(
  kubectl -n flux-system get secret sops-age \
    -o jsonpath='{.data.identity\\.agekey}'
)"
LOCAL_KEY_B64="$(base64 < "$KEY_FILE" | tr -d '\r\n')"

[[ -n "$CLUSTER_KEY_B64" ]] || {
  echo "flux-system/sops-age enthält keinen identity.agekey." >&2
  exit 1
}

[[ "$CLUSTER_KEY_B64" == "$LOCAL_KEY_B64" ]] || {
  echo "Abbruch: Lokaler age-Key und flux-system/sops-age stimmen nicht überein." >&2
  exit 1
}

LIVE_PROVIDER="$(
  kubectl -n flux-system get kustomization flux-system \
    -o jsonpath='{.spec.decryption.provider}'
)"
LIVE_SECRET="$(
  kubectl -n flux-system get kustomization flux-system \
    -o jsonpath='{.spec.decryption.secretRef.name}'
)"

if [[ "$LIVE_PROVIDER" != "sops" || "$LIVE_SECRET" != "sops-age" ]]; then
  kubectl -n flux-system patch kustomization flux-system \
    --type=merge \
    -p '{"spec":{"decryption":{"provider":"sops","secretRef":{"name":"sops-age"}}}}'
else
  echo "Live-Flux-Decryption ist bereits korrekt aktiviert."
fi

NOW="$(date +%s)"
kubectl -n flux-system annotate gitrepository flux-system \
  "reconcile.fluxcd.io/requestedAt=$NOW" --overwrite
kubectl -n flux-system annotate kustomization flux-system \
  "reconcile.fluxcd.io/requestedAt=$NOW" --overwrite

kubectl -n flux-system wait \
  --for=condition=ready \
  kustomization/flux-system \
  --timeout=180s

REVISION="$(
  kubectl -n flux-system get kustomization flux-system \
    -o jsonpath='{.status.lastAppliedRevision}'
)"

echo
echo "Flux-SOPS Live-Bootstrap erfolgreich."
echo "Applied revision: $REVISION"
echo
kubectl -n blog-staging get secret ghcr-pull
kubectl -n cloudflare get secret cloudflared-token
kubectl -n blog-staging get pods
