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
6. wartet anschließend auf den öffentlichen Canary `https://blog.obivan.org` und prüft Healthcheck, Build-Version und Kernel Grep.

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

## Production-Gate

Der aktuelle öffentliche Deployment-Gate ist der echte Production-Hostname:

```text
https://blog.obivan.org
  -> K3s Production
  -> http://blog.blog-production.svc.cluster.local:80
```

Ein separater direkter K3s-Origin ist aktuell bewusst nicht veröffentlicht. Sobald der geplante HAProxy-Failover vor K3s und Hetzner steht, soll die Trennung so aussehen:

```text
blog.obivan.org
  -> HAProxy / Failover Entry Point

origin-blog.obivan.org
  -> ausschließlich K3s
```

Dann kann der Deployment-Gate wieder den dedizierten Origin prüfen, ohne den Failover-Pfad mit dem direkten K3s-Ziel zu vermischen.

## Öffentlicher Betrieb

`blog.obivan.org` zeigt inzwischen auf K3s Production. Hetzner wird trotzdem weiterhin aus `main` aktualisiert und bleibt als aktueller Standby-Origin bestehen.

Dadurch bleibt der spätere Failover auf Hetzner ohne Restore möglich. Der nächste Ausbau ist ein eigener HAProxy-/Failover-Einstiegspunkt vor beiden Origins.
