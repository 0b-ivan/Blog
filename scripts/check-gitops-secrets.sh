#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SECRET_DIR="$ROOT/infra/kubernetes/staging/secrets"
SYNC_FILE="$ROOT/infra/kubernetes/staging/flux-system/gotk-sync.yaml"
KUSTOMIZATION="$ROOT/infra/kubernetes/staging/kustomization.yaml"

if git -C "$ROOT" ls-files '*.agekey' | grep -q .; then
  echo "Private age-Key-Datei ist in Git getrackt." >&2
  git -C "$ROOT" ls-files '*.agekey' >&2
  exit 1
fi

SECRET_FILES=()
while IFS= read -r file; do
  SECRET_FILES+=("$file")
done < <(
  find "$SECRET_DIR" -maxdepth 1 -type f -name '*.sops.yaml' -print 2>/dev/null | sort
)

for file in "${SECRET_FILES[@]}"; do
  grep -q '^kind: Secret$' "$file" || {
    echo "$file: kein Kubernetes Secret" >&2
    exit 1
  }
  grep -q '^sops:' "$file" || {
    echo "$file: SOPS-Metadaten fehlen" >&2
    exit 1
  }
  grep -q 'ENC\[AES256_GCM' "$file" || {
    echo "$file: keine verschlüsselten Werte gefunden" >&2
    exit 1
  }

  FILE="$file" python3 <<'PY'
import os
import re
from pathlib import Path

path = Path(os.environ["FILE"])
lines = path.read_text(encoding="utf-8").splitlines()
inside = False
seen_value = False

for lineno, line in enumerate(lines, 1):
    if re.match(r"^(data|stringData):\s*$", line):
        inside = True
        continue

    if inside and line and not line.startswith(" "):
        inside = False

    if not inside or not line.strip() or line.lstrip().startswith("#"):
        continue

    match = re.match(r"^\s{2}[^:]+:\s*(.+)$", line)
    if not match:
        continue

    seen_value = True
    value = match.group(1).strip()
    if not value.startswith("ENC["):
        raise SystemExit(
            f"{path}:{lineno}: Klartext unter data/stringData gefunden"
        )

if not seen_value:
    raise SystemExit(f"{path}: keine data/stringData-Werte gefunden")
PY
done

SYNC_HAS_SOPS=false
if grep -q 'provider: sops' "$SYNC_FILE" &&
   grep -q 'name: sops-age' "$SYNC_FILE"; then
  SYNC_HAS_SOPS=true
fi

KUSTOMIZATION_HAS_SECRETS=false
if grep -q 'secrets/ghcr-pull.sops.yaml' "$KUSTOMIZATION" &&
   grep -q 'secrets/cloudflared-token.sops.yaml' "$KUSTOMIZATION"; then
  KUSTOMIZATION_HAS_SECRETS=true
fi

if (( ${#SECRET_FILES[@]} > 0 )); then
  (( ${#SECRET_FILES[@]} == 2 )) || {
    echo "Erwartet werden genau zwei verschlüsselte Staging-Secrets." >&2
    exit 1
  }
  [[ "$SYNC_HAS_SOPS" == true ]] || {
    echo "Verschlüsselte Secrets vorhanden, aber Flux-Decryption ist nicht aktiviert." >&2
    exit 1
  }
  [[ "$KUSTOMIZATION_HAS_SECRETS" == true ]] || {
    echo "Verschlüsselte Secrets sind nicht vollständig in Kustomize referenziert." >&2
    exit 1
  }
else
  [[ "$SYNC_HAS_SOPS" == false && "$KUSTOMIZATION_HAS_SECRETS" == false ]] || {
    echo "Flux-SOPS ist aktiviert, aber verschlüsselte Secret-Manifeste fehlen." >&2
    exit 1
  }
fi

echo "GitOps secret hygiene: OK"
