#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-staging-blog.obivan.org}"

dig +short "$HOST" @1.1.1.1
curl -I "https://${HOST}"
curl -fsS "https://${HOST}/healthz"
