#!/bin/sh
set -eu

STACK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REPO_DIR="$(CDPATH= cd -- "$STACK_DIR/../.." && pwd)"
SETTINGS_PATH="/data/.livesync/settings.json"

cd "$STACK_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if [ -n "$(git -C "$REPO_DIR" status --porcelain -- posts 2>/dev/null || true)" ]; then
  echo "posts/ contains uncommitted changes. Commit, stash or discard them before the first LiveSync mirror." >&2
  git -C "$REPO_DIR" status --short -- posts >&2 || true
  exit 1
fi

echo "Building LiveSync CLI from pinned upstream source..."
docker compose --profile headless build livesync-cli

printf 'Setup URI: ' >&2
IFS= read -r SETUP_URI

if [ -z "$SETUP_URI" ]; then
  echo "Setup URI must not be empty" >&2
  exit 1
fi

printf 'Setup URI passphrase: ' >&2
if [ -t 0 ]; then
  stty -echo
  trap 'stty echo' EXIT INT TERM
fi
IFS= read -r SETUP_PASSPHRASE
if [ -t 0 ]; then
  stty echo
  trap - EXIT INT TERM
  printf '\n' >&2
fi

if [ -z "$SETUP_PASSPHRASE" ]; then
  echo "Setup URI passphrase must not be empty" >&2
  exit 1
fi

if docker compose --profile headless run --rm --entrypoint sh livesync-cli \
  -c 'test -s /data/.livesync/settings.json'; then
  echo "LiveSync CLI settings already exist; keeping them."
else
  echo "Initializing LiveSync CLI settings..."
  docker compose --profile headless run --rm livesync-cli init-settings "$SETTINGS_PATH"
fi

echo "Applying encrypted LiveSync setup..."
printf '%s\n' "$SETUP_PASSPHRASE" | \
  docker compose --profile headless run --rm -T livesync-cli \
    --settings "$SETTINGS_PATH" setup "$SETUP_URI"

echo "Synchronising CouchDB into the local CLI database..."
docker compose --profile headless run --rm livesync-cli \
  --settings "$SETTINGS_PATH" sync

echo "Mirroring the existing repository posts and remote vault in both directions..."
docker compose --profile headless run --rm livesync-cli \
  --settings "$SETTINGS_PATH" mirror /vault

echo "Starting continuous headless LiveSync..."
docker compose --profile headless up -d livesync-cli

echo
echo "Headless LiveSync is running. Review files imported from CouchDB before committing:"
git -C "$REPO_DIR" status --short -- posts || true
