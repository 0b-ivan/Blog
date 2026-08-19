#!/usr/bin/env bash
set -euo pipefail

# This installs faasd on a dedicated Linux host (not inside Docker).
# It follows the upstream OpenFaaS installer flow.

if [[ "${EUID}" -eq 0 ]]; then
  echo "Bitte als normaler User starten (nicht direkt als root)."
  exit 1
fi

echo "[1/2] Installiere faasd und Abhaengigkeiten..."
curl -sfL https://raw.githubusercontent.com/openfaas/faasd/master/hack/install.sh | bash -s -

echo "[2/2] Basis-Logininfo:" 
echo "Gateway: http://<DEINE-HOST-IP>:8080"
echo "User: admin"
echo "Passwort liegt in /var/lib/faasd/secrets/basic-auth-password"
