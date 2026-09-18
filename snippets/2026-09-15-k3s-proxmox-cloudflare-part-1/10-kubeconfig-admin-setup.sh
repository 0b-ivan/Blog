#!/usr/bin/env bash
set -euo pipefail

VM_IP="${1:-<VM-IP>}"
KUBECONFIG_FILE="$HOME/.kube/k3s-blog-01.yaml"

mkdir -p "$HOME/.kube"
ssh "obivan@${VM_IP}" 'sudo cat /etc/rancher/k3s/k3s.yaml' > "$KUBECONFIG_FILE"
chmod 600 "$KUBECONFIG_FILE"

# K3s schreibt zunächst 127.0.0.1 in die Datei. Für den entfernten Zugriff
# wird die interne Adresse des Nodes eingesetzt.
sed -i.bak "s#server: https://127.0.0.1:6443#server: https://${VM_IP}:6443#" "$KUBECONFIG_FILE"

export KUBECONFIG="$KUBECONFIG_FILE"
kubectl get nodes
