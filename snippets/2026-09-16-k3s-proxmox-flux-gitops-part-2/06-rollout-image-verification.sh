#!/usr/bin/env bash
set -euo pipefail

kubectl -n blog-staging get pods
kubectl -n blog-staging get deployments
kubectl -n blog-staging get pods -o wide

kubectl -n blog-staging get deployment blog \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'

kubectl -n blog-staging get deployment search \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
