# Deployment und Promotion

Kernel Notes trennt Entwicklung, Staging-Freigabe und Production bewusst voneinander.

## Branch-Modell

Der normale Veröffentlichungsweg ist:

```text
feature/*
   |
   | Pull Request + CI
   v
staging
   |
   | Deploy Staging
   v
K3s Staging
   |
   | öffentlicher Staging-Gate
   v
promotion/staging-verified
   |
   | manueller Merge
   v
main
```

Direkte Änderungen an `staging` oder `main` sind nicht der normale Veröffentlichungsweg. Die Deployment-Workflows prüfen bei automatischen Runs, ob der auslösende Commit zu einem gemergten Pull Request auf den jeweiligen Zielbranch gehört.

## Pull Requests

Ein Feature-Branch zielt zunächst auf `staging`.

Die PR-Checks umfassen je nach Änderungsart unter anderem:

- Frontmatter-Validierung
- Quellen- und Referenzprüfung
- GitOps-Secret-Hygiene
- Shell-Syntax
- ESLint
- Unit-/API-Tests mit Coverage
- semantische Regressionstests
- Docker-Compose-Validierung
- Container-Builds
- Browser- und History-Smokechecks
- Trivy-Scans

Content-, Semantic-, Security- und Heavy-Checks werden anhand der geänderten Dateien klassifiziert.

## Staging

Der Workflow `.github/workflows/cd-staging.yml` läuft für relevante Änderungen auf `staging`.

Bei Anwendungs- oder Content-Änderungen baut er vier SHA-gepinnte Images:

- `kernel-notes-blog`
- `kernel-notes-search`
- `kernel-notes-status`
- `kernel-notes-chaos`

Die Images werden in GHCR veröffentlicht. Anschließend aktualisiert der Workflow die Image-Pins in `infra/kubernetes/staging/kustomization.yaml`.

Beim Schreiben dieses generierten GitOps-Commits kann `staging` zwischen Checkout und Push durch einen weiteren Merge weiterlaufen. Der Workflow holt deshalb unmittelbar vor dem Push den aktuellen Remote-Stand, rebasiert den ausschließlich generierten Desired-State-Commit darauf und versucht den Push begrenzt erneut. Ein echter Rebase-Konflikt wird bewusst nicht automatisch überschrieben, damit ein neuerer GitOps-Zustand nicht stillschweigend verloren geht.

Flux reconciliert diesen Git-Zustand in den Staging-Cluster. GitHub Actions benötigt dafür keinen direkten Zugriff auf die private K3s-API.

Reine GitOps-Änderungen können die bereits gepinnten Images wiederverwenden.

## Staging-Gate

Ein Staging-Stand ist erst dann promotionsfähig, wenn die öffentlich erreichbare Umgebung den erwarteten Build tatsächlich ausliefert.

Der Gate prüft unter anderem:

- `/healthz`
- `/build-info.json`
- die erwartete Staging-Version
- die sichtbare Staging-Kennzeichnung

Erst nach erfolgreicher Prüfung wird `promotion/staging-verified` auf den verifizierten Stand gebracht und der Promotion-PR nach `main` geöffnet bzw. aktualisiert.

`promotion/staging-verified` ist dabei bewusst **kein Entwicklungsbranch**, sondern ein beweglicher Zeiger auf den zuletzt öffentlich verifizierten Staging-Commit. Der Workflow aktualisiert diesen Zeiger mit `--force-with-lease`, damit auch eine zuvor divergierte Promotion-Historie sicher ersetzt werden kann, ohne parallele Änderungen unbemerkt zu überschreiben.

Der Merge dieses Promotion-PRs bleibt manuell.

## Production

Ein Merge nach `main` bedient zwei getrennte Production-Pfade.

### K3s Production

`.github/workflows/cd-k8s-production.yml` baut für den freigegebenen `main`-Commit immutable Images für:

- Blog
- Kernel Grep
- Kubernetes-Status

Die Datei `VERSION` bleibt absichtlich reines SemVer, weil die Deployment-Workflows sie strikt validieren. Größere sichtbare Releases bekommen zusätzlich einen menschenlesbaren Namen in `RELEASE_NAME`; dieser wird über `/build-info.json` und im Footer angezeigt.

Die Build-Version enthält zusätzlich den verkürzten Git-SHA:

```text
<VERSION>+<12-stelliger-main-SHA>
```

Der Workflow kopiert `infra/kubernetes/base` und `infra/kubernetes/production` in den separaten Branch `production-gitops`, pinnt dort alle Production-Images auf den exakten `main`-SHA und überlässt Flux das Rolling Deployment.

Danach wird `https://blog.obivan.org` als Production-Canary geprüft:

- Healthcheck
- Build-Version
- Kernel-Grep-Suche

`blog.obivan.org` zeigt aktuell auf K3s Production.

### Hetzner Standby

Parallel läuft `.github/workflows/cd.yml`.

Hetzner bleibt damit auf demselben freigegebenen `main`-Stand und dient als Standby-/Rollback-Origin.

Bei reinen Content-Änderungen vermeidet dieser Pfad einen vollständigen Image-Rebuild. Stattdessen werden Content und History in persistente Docker-Volumes synchronisiert und Kernel Grep live reindiziert.

Bei Runtime- oder Anwendungsänderungen werden Blog und Search als neue Images gebaut und per Docker Compose ausgerollt.

## Content-Änderungen

Die beiden Production-Pfade behandeln Content bewusst unterschiedlich.

K3s:

```text
Content-Änderung
  -> neues immutable Image
  -> Git-SHA-Pin
  -> Flux Rolling Deployment
```

Hetzner:

```text
Content-Änderung
  -> Content-Paket
  -> persistente Volumes
  -> Live-Reindex
  -> Smokechecks
```

Beide Wege werden erst aus dem nach `main` promoteten Stand gespeist.

## Rollback

K3s ist durch immutable SHA-Tags und den separaten `production-gitops`-Zustand reproduzierbar.

Hetzner bleibt zusätzlich aktuell, sodass ein Standby-Origin ohne vorherigen Restore vorhanden ist.

Ein automatischer Failover zwischen K3s und Hetzner ist aktuell noch nicht implementiert. Die geplante vorgeschaltete HAProxy-/Failover-Schicht ist deshalb als zukünftiger Ausbau und nicht als bestehende Betriebsfunktion zu behandeln.

## Manuelle Deployments

Die Workflows besitzen `workflow_dispatch` für kontrollierte manuelle Ausführungen. Das ist ein Betriebswerkzeug, ersetzt aber nicht den normalen Promotion-Pfad für reguläre Veröffentlichungen.

## Secrets

Secrets werden weder in Kubernetes-Manifeste noch in die Dokumentation committed.

Staging und Production verwenden dafür die vorgesehenen GitHub-/Cluster-Secrets beziehungsweise verschlüsselte Secret-Manifeste. Konkrete Bootstrap-Anweisungen stehen in den jeweiligen Infra-READMEs.
