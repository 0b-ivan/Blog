#!/usr/bin/env bash
set -euo pipefail

for cmd in age-keygen kubectl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Fehlt: $cmd" >&2
    exit 1
  }
done

KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
KEY_DIR="$(dirname "$KEY_FILE")"
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
KEY_DIR_REAL="$(cd "$KEY_DIR" && pwd -P)"
KEY_FILE_REAL="$KEY_DIR_REAL/$(basename "$KEY_FILE")"

if [[ -n "$REPO_ROOT" && "$KEY_FILE_REAL" == "$REPO_ROOT/"* ]]; then
  echo "Abbruch: Der private age-Key darf nicht im Git-Repository liegen." >&2
  exit 1
fi

if [[ ! -s "$KEY_FILE" ]]; then
  umask 077
  age-keygen -o "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi

AGE_RECIPIENT="$(age-keygen -y "$KEY_FILE")"

kubectl get namespace flux-system >/dev/null

kubectl -n flux-system create secret generic sops-age   --from-file=identity.agekey="$KEY_FILE"   --dry-run=client   -o yaml |
  kubectl apply -f -

kubectl -n flux-system get secret sops-age   -o jsonpath='{.data.identity\.agekey}' |
  grep -q .

echo "SOPS age bootstrap ist vorbereitet."
echo "Public recipient: $AGE_RECIPIENT"
echo "Private key: $KEY_FILE"
echo "Der private Key wurde nicht ausgegeben."
echo
echo "Wichtig: Den privaten Key zusätzlich außerhalb des Clusters sicher sichern."
