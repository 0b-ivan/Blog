# Staging-Cluster

Die Manifeste veröffentlichen selbst keine NodePorts oder LoadBalancer. Der Zugriff erfolgt ausschließlich über einen Cloudflare Tunnel, der aus dem Cluster nach außen verbindet.

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

Im Cloudflare Tunnel wird der Public Hostname `staging.blog.obivan.org` auf diesen internen Origin gelegt:

```text
http://blog.blog-staging.svc.cluster.local:80
```

Dafür ist keine Portfreigabe am Router, pfSense oder Proxmox erforderlich.

## Erster manueller Test

```bash
kubectl apply -k infra/kubernetes/staging
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/blog
kubectl -n cloudflare rollout status deployment/cloudflared
kubectl -n blog-staging get pods,svc
```

## Flux

Flux wird bewusst noch nicht eingecheckt. Sobald der K3s-Node läuft und der manuelle Kustomize-Test erfolgreich ist, kann Flux auf genau diesen Pfad gebootstrapped werden:

```bash
flux bootstrap github \
  --owner=0b-ivan \
  --repository=Blog \
  --branch=main \
  --path=infra/kubernetes/staging \
  --personal
```

Danach zieht der Cluster seinen gewünschten Zustand selbst aus GitHub. GitHub Actions benötigt keinen Netzwerkzugriff auf den K3s-API-Server.

`latest` ist nur für den ersten Staging-Bootstrap vorgesehen. Im nächsten Schritt wird Staging auf immutable SHA-Tags umgestellt, damit Git und laufendes Image eindeutig zusammenpassen.
