# Staging-Cluster

Die Manifeste veröffentlichen selbst keine NodePorts oder LoadBalancer. Der Zugriff erfolgt ausschließlich über einen Cloudflare Tunnel, der aus dem Cluster nach außen verbindet.

Der öffentliche Staging-Hostname ist:

```text
https://staging-blog.obivan.org
```

## Benötigte Secrets

Das private GHCR-Paket benötigt einen Token mit mindestens `read:packages`:

```bash
kubectl -n blog-staging create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=0b-ivan \
  --docker-password="$GHCR_TOKEN"
```

Für den separat angelegten Cloudflare Tunnel:

```bash
kubectl -n cloudflare create secret generic cloudflared-token \
  --from-literal=token="$CLOUDFLARE_TUNNEL_TOKEN"
```

Im Cloudflare Tunnel wird der Public Hostname `staging-blog.obivan.org` auf diesen internen Origin gelegt:

```text
http://blog.blog-staging.svc.cluster.local:80
```

Dafür ist keine Portfreigabe am Router, pfSense oder Proxmox erforderlich.

## Images

Blog und Kernel Grep verwenden keine `latest`-Tags mehr. Staging ist auf den exakten Git-Commit gepinnt, dessen Produktions-Build die Images erfolgreich nach GHCR gepusht hat:

```text
43ff082ebf297c2444dc7f98c20b184b73f8f410
```

Damit ist eindeutig nachvollziehbar, welcher Git-Stand im Cluster läuft. `cloudflared` wird über Kustomize auf `2026.9.1` gepinnt.

## Manueller Test

```bash
kubectl apply -k infra/kubernetes/staging
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/blog
kubectl -n cloudflare rollout status deployment/cloudflared
kubectl -n blog-staging get pods,svc
```

## Flux

Flux wird erst nach dem Merge dieses Staging-PRs gegen `main` gebootstrapped. Dadurch ist `main` die einzige GitOps-Quelle und der Cluster benötigt keinen eingehenden Netzwerkzugriff von GitHub Actions.

Auf einem Admin-Host mit Zugriff auf den K3s-API-Server, `flux`, `gh` und einem passenden `KUBECONFIG`:

```bash
export GITHUB_TOKEN="$(gh auth token)"

flux check --pre

flux bootstrap github \
  --owner=0b-ivan \
  --repository=Blog \
  --branch=main \
  --path=infra/kubernetes/staging/flux-system \
  --personal

unset GITHUB_TOKEN
```

Der Bootstrap legt die Flux-Controller und die Git-Synchronisation im Cluster an und committed die generierten Bootstrap-Manifeste in den angegebenen Pfad. Danach zieht der Cluster seinen gewünschten Zustand selbst aus GitHub.

Die Image-SHAs bleiben bewusst deklarativ im Repository. Ein automatischer Image-Updater ist ein separater Schritt; Flux soll zunächst nur den in Git freigegebenen Zustand reconciliieren.
