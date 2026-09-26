#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import os
import re
from pathlib import Path

path = Path('infra/kubernetes/staging/kustomization.yaml')
text = path.read_text(encoding='utf-8')
sha = os.environ['DEPLOY_SHA']
owner = os.environ['OWNER_LOWER']

for image in ('kernel-notes-blog', 'kernel-notes-search', 'kernel-notes-status', 'kernel-notes-chaos', 'kernel-notes-pdf'):
    pattern = (
        rf'(  - name: ghcr\.io/{re.escape(owner)}/{image}\n'
        rf'    newTag: )[A-Za-z0-9._-]+'
    )
    text, count = re.subn(pattern, rf'\g<1>{sha}', text)
    if count != 1:
        raise SystemExit(f'Expected one Kustomize image entry for {image}, found {count}')

path.write_text(text, encoding='utf-8')
PY

git diff --check
git diff -- infra/kubernetes/staging/kustomization.yaml
