#!/usr/bin/env bash
set -euo pipefail

kubectl apply -k infra/kubernetes/staging
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/blog
kubectl -n blog-staging get pods,svc -o wide

# Bei Problemen <POD> durch den betroffenen Pod-Namen ersetzen.
kubectl -n blog-staging describe pod <POD>
kubectl -n blog-staging logs <POD>
kubectl -n blog-staging get events --sort-by=.lastTimestamp
