# Kubernetes-Production auf Proxmox

Die K3s-Production läuft parallel zur bestehenden Hetzner-Production. Beide werden aus `main` weiter aktuell gehalten.

```text
Obsidian
   |
   v
Publisher -> staging -> verifizierter Promotion-PR -> main
                                              |
                         +--------------------+--------------------+
                         |                                         |
                         v                                         v
                Deploy (Hetzner)                         Deploy K3s Production
                         |                                         |
                Content/Compose                           immutable SHA-Images
                         |                                         |
                         v                                         v
                 Hetzner Standby                         production-gitops
                                                                   |
                                                                  Flux
                                                                   |
                                                                   v
                                                         blog-production
                                                         3x blog + 1x search
```

## Hetzner bleibt aktuell

Der bestehende Workflow `.github/workflows/cd.yml` bleibt unverändert zuständig für Hetzner.

Bei reinen Content-Änderungen synchronisiert er weiterhin Posts, Snippets, Assets, Archiv und History in die bestehenden Docker-Volumes und reindiziert Kernel Grep live. Bei vollständigen Deployments aktualisiert er weiterhin Blog und Search per Docker Compose.

Damit bleibt Hetzner auch nach einem öffentlichen K3s-Cutover ein aktueller Rollback-Standby.

## K3s bekommt denselben main-Stand

Der separate Workflow `.github/workflows/cd-k8s-production.yml` läuft ebenfalls für relevante Änderungen auf `main`.

Er:

1. baut Blog und Search auch bei Content-Änderungen neu,
2. pusht beide Images unter dem unveränderlichen Git-SHA nach GHCR,
3. synchronisiert `infra/kubernetes/base` und `infra/kubernetes/production` in den Branch `production-gitops`,
4. pinnt dort Blog und Search auf exakt den `main`-SHA,
5. lässt Flux das Rolling Deployment durchführen,
6. wartet anschließend auf den öffentlichen Canary `https://k8s-blog.obivan.org` und prüft Healthcheck, Build-Version und Kernel Grep.

Der Build bekommt eine eindeutig prüfbare Version:

```text
<VERSION>+<12-stelliger-main-SHA>
```

Der semantische `VERSION`-Wert im Repository bleibt davon unberührt.

## Production-GitOps ist von Staging getrennt

Flux liest Production nicht mehr direkt aus dem Branch `staging`.

```text
GitRepository blog-production-source
  branch: production-gitops
          |
          v
Kustomization blog-production
  path: ./infra/kubernetes/production
```

Damit kann eine noch nicht nach `main` promotete Staging-Infrastruktur die Production nicht versehentlich verändern.

Der Branch `production-gitops` wird ausschließlich vom Production-Workflow fortgeschrieben. Infrastruktur aus `base` und `production` wird erst übernommen, nachdem sie Bestandteil von `main` geworden ist.

## Obsidian und LiveSync

Obsidian LiveSync, CouchDB, der Headless-LiveSync-Client und der Publisher können zunächst auf Hetzner bleiben. Der Wechsel des öffentlichen Blog-Traffics zu K3s verändert diesen Authoring-Pfad nicht.

Auch `.github/workflows/sync-main-to-obsidian.yml` bleibt bestehen und spiegelt veröffentlichte bzw. archivierte Notes weiterhin auf den Hetzner-Headless-Vault zurück.

## Canary

Vor und nach dem Cutover bleibt dieser Hostname bestehen:

```text
https://k8s-blog.obivan.org
  -> http://blog.blog-production.svc.cluster.local:80
```

Er ist gleichzeitig der öffentliche Deployment-Gate für den K3s-Production-Workflow.

## Öffentlicher Cutover

Erst wenn der Dual-Deploy einmal erfolgreich von `main` durchgelaufen ist, wird `blog.obivan.org` auf denselben K3s-Service geroutet.

Hetzner wird dabei nicht abgeschaltet. Dadurch bleibt der Rückweg ein reiner Cloudflare-/DNS-Rollback und benötigt keinen Restore.
