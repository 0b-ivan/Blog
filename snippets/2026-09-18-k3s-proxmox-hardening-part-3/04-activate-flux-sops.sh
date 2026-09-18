#!/usr/bin/env bash
set -euo pipefail

for cmd in age-keygen base64 git kubectl python3 sops; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Fehlt: $cmd" >&2
    exit 1
  }
done

ROOT="$(git rev-parse --show-toplevel)"
KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
SYNC_FILE="$ROOT/infra/kubernetes/staging/flux-system/gotk-sync.yaml"
KUSTOMIZATION="$ROOT/infra/kubernetes/staging/kustomization.yaml"
GHCR_SECRET="$ROOT/infra/kubernetes/staging/secrets/ghcr-pull.sops.yaml"
CLOUDFLARED_SECRET="$ROOT/infra/kubernetes/staging/secrets/cloudflared-token.sops.yaml"

[[ -s "$KEY_FILE" ]] || {
  echo "Age-Key fehlt: $KEY_FILE" >&2
  exit 1
}

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

for file in "$GHCR_SECRET" "$CLOUDFLARED_SECRET"; do
  [[ -s "$file" ]] || {
    echo "Fehlt: $file" >&2
    exit 1
  }
  sops --decrypt "$file" >/dev/null
done

ROOT="$ROOT" python3 <<'PY'
import os
from pathlib import Path

root = Path(os.environ["ROOT"])
sync_file = root / "infra/kubernetes/staging/flux-system/gotk-sync.yaml"
kustomization_file = root / "infra/kubernetes/staging/kustomization.yaml"

sync = sync_file.read_text(encoding="utf-8")
if "provider: sops" not in sync:
    needle = "  prune: true\n  sourceRef:\n"
    replacement = (
        "  prune: true\n"
        "  decryption:\n"
        "    provider: sops\n"
        "    secretRef:\n"
        "      name: sops-age\n"
        "  sourceRef:\n"
    )
    if needle not in sync:
        raise SystemExit("gotk-sync.yaml: erwartete Einfügestelle nicht gefunden")
    sync = sync.replace(needle, replacement, 1)
    sync_file.write_text(sync, encoding="utf-8")

kustomization = kustomization_file.read_text(encoding="utf-8")
resources = [
    "  - secrets/ghcr-pull.sops.yaml\n",
    "  - secrets/cloudflared-token.sops.yaml\n",
]
missing = [line for line in resources if line not in kustomization]
if missing:
    needle = "  - cloudflared.yaml\n"
    if needle not in kustomization:
        raise SystemExit("kustomization.yaml: erwartete Einfügestelle nicht gefunden")
    kustomization = kustomization.replace(
        needle,
        needle + "".join(missing),
        1,
    )
    kustomization_file.write_text(kustomization, encoding="utf-8")
PY

bash "$ROOT/scripts/check-gitops-secrets.sh"
git -C "$ROOT" diff --check
kubectl kustomize "$ROOT/infra/kubernetes/staging" >/dev/null

echo
echo "Flux-SOPS ist im Git-Sollzustand vorbereitet."
echo "Die laufende Flux-Kustomization wurde bewusst noch nicht gepatcht."
echo
echo "Nächste Reihenfolge:"
echo "  1. Änderungen committen und über PR nach staging mergen."
echo "  2. Prüfen, dass origin/staging den SOPS-Sollzustand enthält."
echo "  3. Danach 05-bootstrap-live-flux-sops.sh ausführen."
echo
git -C "$ROOT" diff -- \
  infra/kubernetes/staging/flux-system/gotk-sync.yaml \
  infra/kubernetes/staging/kustomization.yaml \
  infra/kubernetes/staging/secrets
