#!/usr/bin/env bash
set -euo pipefail

for cmd in git kubectl python3 sops; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Fehlt: $cmd" >&2
    exit 1
  }
done

ROOT="$(git rev-parse --show-toplevel)"
SYNC_FILE="$ROOT/infra/kubernetes/staging/flux-system/gotk-sync.yaml"
KUSTOMIZATION="$ROOT/infra/kubernetes/staging/kustomization.yaml"
GHCR_SECRET="$ROOT/infra/kubernetes/staging/secrets/ghcr-pull.sops.yaml"
CLOUDFLARED_SECRET="$ROOT/infra/kubernetes/staging/secrets/cloudflared-token.sops.yaml"

kubectl -n flux-system get secret sops-age   -o jsonpath='{.data.identity\.agekey}' |
  grep -q .

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

if command -v kubectl >/dev/null 2>&1; then
  kubectl kustomize "$ROOT/infra/kubernetes/staging" >/dev/null
fi

echo
echo "Flux-SOPS ist im Git-Sollzustand vorbereitet."
echo "Noch wurde nichts committed oder von Flux reconciled."
echo
git -C "$ROOT" diff --   infra/kubernetes/staging/flux-system/gotk-sync.yaml   infra/kubernetes/staging/kustomization.yaml   infra/kubernetes/staging/secrets
