# Staging-Cluster

Die Manifeste veröffentlichen selbst keine NodePorts oder LoadBalancer. Der Zugriff erfolgt ausschließlich über einen Cloudflare Tunnel, der aus dem Cluster nach außen verbindet.

Der öffentliche Staging-Hostname ist:

```text
https://staging-blog.obivan.org
```

## Branch- und Deployment-Modell

Staging und Production sind bewusst getrennt:

```text
feature/*
   |
   | PR + CI
   v
staging
   |
   | GitHub Actions baut Blog + Kernel Grep
   | Images -> GHCR
   | SHA-Pins -> infra/kubernetes/staging/kustomization.yaml
   v
Flux -> K3s -> staging-blog.obivan.org
   |
   | PR staging -> main
   v
main -> bestehendes Hetzner-Production-Deployment -> blog.obivan.org
```

Ein Merge nach `staging` veröffentlicht damit noch nichts auf Production. Production bleibt ausschließlich an `main` gebunden.

Der Workflow `.github/workflows/cd-staging.yml` akzeptiert automatische Staging-Deployments nur für Commits, die zu einem gemergten Pull Request mit Zielbranch `staging` gehören. Danach werden Blog und Kernel Grep unter dem unveränderlichen Git-Commit-SHA nach GHCR gepusht. Der Workflow aktualisiert anschließend nur die Image-Pins in `kustomization.yaml`.

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

## Images und Staging-Runtime

Blog und Kernel Grep verwenden im Cluster keine `latest`-Tags. Die Kustomize-Konfiguration pinnt beide Images auf einen exakten Git-Commit. Der Staging-Workflow aktualisiert diese Pins nach einem erfolgreichen Build automatisch.

Der Blog bekommt in Staging zusätzlich per Kustomize-Patch den Entrypoint:

```text
staging-server.js
```

Damit werden der orange/schwarz gestreifte Rahmen und das `STAGING`-Banner ausschließlich in der Staging-Umgebung aktiviert. Production verwendet weiterhin `seo-server.js`.

`cloudflared` ist separat auf Version `2026.9.1` gepinnt.

## Manueller Test

```bash
kubectl apply -k infra/kubernetes/staging
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/blog
kubectl -n cloudflare rollout status deployment/cloudflared
kubectl -n blog-staging get pods,svc
```

## Flux

Flux verwendet den Branch `staging` als GitOps-Quelle. Der Cluster benötigt dadurch keinen eingehenden Netzwerkzugriff von GitHub Actions.

Auf einem Admin-Host mit Zugriff auf den K3s-API-Server, `flux`, `gh` und einem passenden `KUBECONFIG`:

```bash
export GITHUB_TOKEN="$(gh auth token)"

flux check --pre

flux bootstrap github \
  --owner=0b-ivan \
  --repository=Blog \
  --branch=staging \
  --path=infra/kubernetes/staging \
  --personal \
  --token-auth=false

unset GITHUB_TOKEN
```

`--path` zeigt dabei auf den vom Cluster zu reconciliierenden Staging-Ordner. Der Bootstrap legt seine eigenen Manifeste darunter in `infra/kubernetes/staging/flux-system/` an und konfiguriert den Cluster auf den Branch `staging`.

Der Image-Build bleibt in GitHub Actions, das eigentliche Cluster-Deployment bleibt Pull-basiert über Flux. GitHub Actions braucht dadurch keinen direkten Netzwerkzugriff auf das private K3s-Netz.

Hinweis für später enforced Rulesets: Der GitHub-Actions-Bot muss die automatischen Änderungen an den Image-Pins auf `staging` schreiben dürfen. Wenn die Rulesets durch einen passenden GitHub-Plan tatsächlich enforced werden, muss dafür ein gezielter Bypass bzw. eine gleichwertige Automationsregel eingerichtet werden.
