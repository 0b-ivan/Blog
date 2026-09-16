#!/usr/bin/env bash
set -euo pipefail

sudo k3s kubectl get nodes -o wide
sudo k3s kubectl get pods -A
sudo k3s secrets-encrypt status
