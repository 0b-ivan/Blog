#!/usr/bin/env bash
set -euo pipefail

flux get sources git -A
flux get kustomizations -A
flux get all -A
kubectl -n flux-system get pods
