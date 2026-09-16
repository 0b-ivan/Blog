#!/usr/bin/env bash
set -euo pipefail

VMID=105
VM_NAME=k3s-blog-01
STORAGE=local-zfs
BRIDGE=vmbr1_serv
IMAGE=/var/lib/vz/template/iso/debian-13-generic-amd64.qcow2

qm create "$VMID" \
  --name "$VM_NAME" \
  --cores 2 \
  --memory 4096 \
  --net0 "virtio,bridge=${BRIDGE}" \
  --scsihw virtio-scsi-single

qm disk import "$VMID" "$IMAGE" "$STORAGE"
qm config "$VMID" | grep '^unused'

# Den tatsächlichen importierten Datenträger aus `qm config` übernehmen.
VM_DISK=local-zfs:vm-105-disk-0

qm set "$VMID" --scsi0 "$VM_DISK"
qm set "$VMID" --ide2 "${STORAGE}:cloudinit"
qm set "$VMID" --boot order=scsi0
qm set "$VMID" --serial0 socket --vga serial0
qm set "$VMID" --agent enabled=1
qm set "$VMID" --ciuser obivan
qm set "$VMID" --sshkeys ~/.ssh/id_ed25519.pub
qm set "$VMID" --ipconfig0 ip=dhcp
qm start "$VMID"
