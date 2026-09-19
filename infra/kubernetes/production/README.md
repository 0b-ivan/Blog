# Kubernetes-Production auf Proxmox

Dieses Overlay startet eine interne Production-Kopie des Blogs im bestehenden K3s-Cluster. Es übernimmt noch keinen öffentlichen Traffic.

Aktueller Aufbau:

```text
blog.obivan.org
    |
    v
Hetzner Docker Compose        <- bleibt öffentliche Production

K3s / Proxmox
    |
    +-- namespace blog-staging
    |     +-- 3x blog
    |     +-- 1x search
    |
    +-- namespace blog-production
          +-- 3x blog
          +-- 1x search
          +-- kein Cloudflare-Tunnel
```

Damit können wir Production unter Kubernetes testen, ohne den bestehenden Hetzner-Deploy abzuschalten oder DNS/Tunnel umzuschalten.

## Gemeinsame Basis

Die Deployments und Services liegen unter:

```text
infra/kubernetes/base
```

Staging und Production verwenden damit dieselben Probes, Ressourcenlimits, Services und Container-Konfigurationen. Die Overlays unterscheiden Namespace, Replica-Anzahl, Image-Pins und Staging-spezifische Runtime-Argumente.

Production verwendet bewusst `seo-server.js` aus dem Image-Default. Nur Staging setzt per Patch `staging-server.js`.

## Images

Die Production-Kopie ist auf einen exakten `main`-Commit gepinnt:

```text
227fbe6f417799ab1ff8928dc6820910861a3bfb
```

Der öffentliche Hetzner-Deploy bleibt weiterhin die maßgebliche Production. Das Kubernetes-Overlay ist zunächst nur eine parallele interne Instanz.

## Flux

`infra/kubernetes/staging/production-flux.yaml` legt eine zweite Flux-Kustomization an. Sie verwendet dieselbe GitRepository-Quelle und dasselbe SOPS-age-Key-Material, reconciliert aber:

```text
./infra/kubernetes/production
```

Der Production-Namespace wird dadurch separat reconciliiert und gepruned.

## Prüfen

Auf einem Admin-Host mit Zugriff auf den Cluster:

```bash
export KUBECONFIG=/root/.kube/k3s-blog-01.yaml

flux get kustomizations -A

kubectl -n blog-production rollout status deployment/search --timeout=300s
kubectl -n blog-production rollout status deployment/blog --timeout=180s
kubectl -n blog-production get pods -o wide
kubectl -n blog-production get endpointslice -o wide

scripts/verify-production-k8s.sh
```

Erst nach diesen Tests bekommt `blog-production` einen eigenen Cloudflare-Origin. `blog.obivan.org` wird in diesem Schritt ausdrücklich nicht umgeschaltet.
