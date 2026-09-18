#!/usr/bin/env bash
set -euo pipefail

for cmd in age-keygen base64 git kubectl sops; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Fehlt: $cmd" >&2
    exit 1
  }
done

ROOT="$(git rev-parse --show-toplevel)"
KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
OUT_DIR="$ROOT/infra/kubernetes/staging/secrets"

[[ -s "$KEY_FILE" ]] || {
  echo "Age-Key fehlt: $KEY_FILE" >&2
  exit 1
}

AGE_RECIPIENT="$(age-keygen -y "$KEY_FILE")"

CLUSTER_KEY_B64="$(
  kubectl -n flux-system get secret sops-age     -o jsonpath='{.data.identity\.agekey}'
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

GHCR_DATA="$(
  kubectl -n blog-staging get secret ghcr-pull     -o jsonpath='{.data.\.dockerconfigjson}'
)"
CLOUDFLARED_DATA="$(
  kubectl -n cloudflare get secret cloudflared-token     -o jsonpath='{.data.token}'
)"

[[ -n "$GHCR_DATA" ]] || {
  echo "blog-staging/ghcr-pull enthält keine .dockerconfigjson-Daten." >&2
  exit 1
}
[[ -n "$CLOUDFLARED_DATA" ]] || {
  echo "cloudflare/cloudflared-token enthält keinen token." >&2
  exit 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
chmod 700 "$TMP_DIR"
mkdir -p "$OUT_DIR"

cat > "$TMP_DIR/ghcr-pull.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-pull
  namespace: blog-staging
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: $GHCR_DATA
EOF

cat > "$TMP_DIR/cloudflared-token.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: cloudflared-token
  namespace: cloudflare
type: Opaque
data:
  token: $CLOUDFLARED_DATA
EOF

sops --encrypt   --age "$AGE_RECIPIENT"   --encrypted-regex '^(data|stringData)$'   "$TMP_DIR/ghcr-pull.yaml"   > "$OUT_DIR/ghcr-pull.sops.yaml"

sops --encrypt   --age "$AGE_RECIPIENT"   --encrypted-regex '^(data|stringData)$'   "$TMP_DIR/cloudflared-token.yaml"   > "$OUT_DIR/cloudflared-token.sops.yaml"

chmod 644   "$OUT_DIR/ghcr-pull.sops.yaml"   "$OUT_DIR/cloudflared-token.sops.yaml"

sops --decrypt "$OUT_DIR/ghcr-pull.sops.yaml" >/dev/null
sops --decrypt "$OUT_DIR/cloudflared-token.sops.yaml" >/dev/null

grep -q '^sops:' "$OUT_DIR/ghcr-pull.sops.yaml"
grep -q '^sops:' "$OUT_DIR/cloudflared-token.sops.yaml"
grep -q 'ENC\[' "$OUT_DIR/ghcr-pull.sops.yaml"
grep -q 'ENC\[' "$OUT_DIR/cloudflared-token.sops.yaml"

echo "Verschlüsselte Secret-Manifeste erzeugt:"
echo "  $OUT_DIR/ghcr-pull.sops.yaml"
echo "  $OUT_DIR/cloudflared-token.sops.yaml"
echo
echo "Klartext wurde nur im temporären Verzeichnis erzeugt und beim Exit entfernt."
echo "Als Nächstes: snippets/2026-09-18-k3s-proxmox-hardening-part-3/04-activate-flux-sops.sh"
