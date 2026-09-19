# Kubernetes-Production auf Proxmox

Dieses Overlay bereitet eine interne Production-Kopie des Blogs im bestehenden K3s-Cluster vor. Es übernimmt noch keinen öffentlichen Traffic.

```text
blog.obivan.org
    |
    v
Hetzner Docker Compose        <- bleibt öffentliche Production

K3s / Proxmox
    |
    +-- blog-staging
    |     +-- 3x blog
    |     +-- 1x search
    |
    +-- blog-production
          +-- 3x blog
          +-- 1x search
          +-- kein Cloudflare-Tunnel
```

Damit können wir Production unter Kubernetes testen, ohne den bestehenden Hetzner-Deploy abzuschalten oder DNS/Tunnel umzuschalten.

## Gemeinsame Basis

Blog und Search liegen unter `infra/kubernetes/base`. Staging und Production verwenden dadurch dieselben Services, Probes, Rolling-Update-Regeln und Ressourcenlimits.

Die Overlays unterscheiden nur die umgebungsspezifischen Teile. Staging setzt drei Blog-Replicas und ergänzt `staging-server.js`. Production setzt ebenfalls drei Blog-Replicas, verwendet aber den normalen Image-Entrypoint `seo-server.js`.

## Production-Images

Die interne Production ist zunächst auf den erfolgreichen `main`-Build gepinnt:

```text
227fbe6f417799ab1ff8928dc6820910861a3bfb
```

Blog- und Search-Image dieses Commits wurden bereits erfolgreich nach GHCR gebaut.

## Flux startet absichtlich suspendiert

`infra/kubernetes/staging/production-flux.yaml` legt eine zweite Flux-Kustomization namens `blog-production` an. Sie reconciliert:

```text
./infra/kubernetes/production
```

Sie wird mit `suspend: true` erstellt. Ein Merge nach `staging` startet daher nicht automatisch eine zweite Production.

Vor dem ersten Resume muss im Namespace `blog-production` ein `ghcr-pull`-Secret mit einem minimalen Read-only-GHCR-Credential vorhanden sein. Das Secret wird in diesem Schritt bewusst noch nicht in Git erzeugt.

Der eigentliche Start läuft über ein bewusst defensives Bootstrap-Skript. Es erstellt keine Zugangsdaten selbst und bricht ab, wenn der Pull-Secret fehlt:

```bash
export KUBECONFIG=/root/.kube/k3s-blog-01.yaml

./scripts/bootstrap-production-k8s.sh
```

Das Skript:
- stellt sicher, dass der Namespace existiert,
- prüft `blog-production/ghcr-pull`,
- resumed die Flux-Kustomization,
- erzwingt einen Reconcile,
- wartet auf Search und Blog,
- führt anschließend `scripts/verify-production-k8s.sh` aus.

Wenn der Secret fehlt, zeigt das Skript nur die nötigen lokalen Schritte an. Der Token selbst gehört weder in Git noch in den Chat.

## Kein Traffic-Cutover

Es gibt absichtlich weder `NodePort`, `LoadBalancer` noch `cloudflared` für `blog-production`. Der bestehende Hetzner-Blog bleibt unter `blog.obivan.org` aktiv.

Erst nachdem Replica-, Service-, Recovery- und Search-Tests bestanden sind, verdrahten wir Cloudflare mit dieser K3s-Production.
