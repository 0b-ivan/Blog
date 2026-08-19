#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-blog-deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/Blog}"
DEPLOY_PUBLIC_KEY="${1:-${DEPLOY_PUBLIC_KEY:-}}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ -z "${DEPLOY_PUBLIC_KEY}" ]]; then
  echo "Usage: sudo $0 '<ssh-public-key>'" >&2
  echo "Or set DEPLOY_PUBLIC_KEY." >&2
  exit 1
fi

if ! getent group docker >/dev/null; then
  echo "Docker group does not exist. Install Docker first." >&2
  exit 1
fi

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi

usermod --append --groups docker "${DEPLOY_USER}"
passwd --lock "${DEPLOY_USER}" >/dev/null 2>&1 || true

DEPLOY_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"
printf 'no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty %s\n' "${DEPLOY_PUBLIC_KEY}" \
  > "${DEPLOY_HOME}/.ssh/authorized_keys"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh/authorized_keys"
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"

install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_DIR}"

echo "Deploy user ready: ${DEPLOY_USER}"
echo "Deploy directory: ${DEPLOY_DIR}"
echo "Set GitHub secret HETZNER_USER=${DEPLOY_USER}"
echo

echo "Note: membership in the docker group grants root-equivalent access to the host."
