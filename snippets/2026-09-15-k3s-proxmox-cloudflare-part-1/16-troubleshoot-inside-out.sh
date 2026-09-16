#!/usr/bin/env bash
set -euo pipefail

# 1. Läuft der Pod?
kubectl -n blog-staging get pods

# 2. Warum läuft er nicht oder wird nicht Ready?
kubectl -n blog-staging describe pod <POD>
kubectl -n blog-staging logs <POD>

# 3. Hat der Service Endpoints?
kubectl -n blog-staging get svc,endpoints

# 4. Funktioniert Service-DNS aus einem Pod?
kubectl -n blog-staging run curl-test \
  --image=curlimages/curl \
  --restart=Never --attach --rm -- \
  curl -fsS http://blog/healthz

# 5. Erreicht der cloudflared-Namespace den Blog?
kubectl -n cloudflare run curl-test \
  --image=curlimages/curl \
  --restart=Never --attach --rm -- \
  curl -fsS http://blog.blog-staging.svc.cluster.local/healthz

# 6. Ist der Tunnel gesund?
kubectl -n cloudflare logs deployment/cloudflared

# 7. Erst jetzt extern testen.
curl -v https://staging-blog.obivan.org/healthz
