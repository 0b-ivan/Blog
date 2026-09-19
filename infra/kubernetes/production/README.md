# Kubernetes-Production auf Proxmox

Die interne Production-Kopie läuft parallel zur bestehenden Hetzner-Production im K3s-Cluster.

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
```

## Gemeinsame Basis

Blog und Search liegen unter `infra/kubernetes/base`. Staging und Production verwenden dieselben Services, Probes, Rolling-Update-Regeln und Ressourcenlimits.

Staging ergänzt `staging-server.js`. Production verwendet den normalen Image-Entrypoint `seo-server.js`.

## Flux

`blog-production` wird inzwischen aktiv von Flux reconciliert:

```text
flux-system/blog-production
  -> ./infra/kubernetes/production
```

Der parallele Production-Test ist intern erfolgreich:

```text
3 Blog-Replicas
1 Search-Replica
Service /healthz = ok
```

## Canary-Hostname vor dem Cutover

Bevor `blog.obivan.org` umgeschaltet wird, bekommt die K3s-Production einen separaten Test-Hostname:

```text
https://k8s-blog.obivan.org
```

Dafür muss kein zweiter `cloudflared`-Pod gestartet werden. Der bestehende Tunnel kann mehrere veröffentlichte Anwendungen bedienen. Im Cloudflare-Dashboard wird auf demselben Tunnel eine zusätzliche Published Application angelegt:

```text
Hostname:
k8s-blog.obivan.org

Service URL:
http://blog.blog-production.svc.cluster.local:80
```

Der bestehende Staging-Eintrag bleibt unverändert:

```text
staging-blog.obivan.org
  -> http://blog.blog-staging.svc.cluster.local:80
```

Damit laufen beide Hostnames über denselben Tunnel, aber auf unterschiedliche Kubernetes-Services.

## Canary prüfen

Sobald Cloudflare den neuen Hostnamen veröffentlicht:

```bash
cd /opt/Blog
git fetch origin staging
git checkout staging
git pull --ff-only

./scripts/verify-production-canary.sh
```

Das Skript prüft:

- `/healthz`
- Startseite ohne Staging-Marker
- `/archive`
- `/grep`
- eine echte Kernel-Grep-Suche über `/api/search`

Ein alternativer Hostname kann so geprüft werden:

```bash
TARGET_URL=https://example.obivan.org ./scripts/verify-production-canary.sh
```

## Noch kein Production-Cutover

`blog.obivan.org` bleibt bis zum erfolgreichen Canary- und Failure-Test auf Hetzner.

Erst danach wird der öffentliche Production-Hostname gezielt auf die K3s-Production umgestellt.
