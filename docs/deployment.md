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
   |
   | automatischer Sync-PR
   v
sync/main-to-staging -> staging
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

Die für `main` verpflichtenden Checks `checks` und `Local assets` werden beim Promotion-Pfad auf dem synthetischen Merge-Commit des Promotion-PRs gespiegelt. Der vollständige PR-Checks-Workflow läuft weiterhin auf dem verifizierten Promotion-SHA. Ein nachgelagerter Job liest den aktuellen `merge_commit_sha` des offenen Promotion-PRs und veröffentlicht dort Check-Runs mit denselben erforderlichen Namen. Damit erfüllt der strikte `main`-Ruleset die Checks auf genau dem Commit, den GitHub tatsächlich mergen würde. Bei einem fehlgeschlagenen Quell-Check wird auch der gespiegelte Check als fehlgeschlagen markiert.

Zusätzlich läuft `.github/workflows/promotion-watchdog.yml` als selbstheilender Reconciler. Er wird nach abgeschlossenen PR-Checks, nach Änderungen an `main`, manuell und spätestens alle fünf Minuten gestartet. Regeneriert GitHub den synthetischen Merge-Commit des Promotion-PRs, veröffentlicht der Watchdog die bereits erfolgreichen Required Checks erneut auf dem aktuellen Merge-SHA. Fehlen die Quellchecks auf dem Promotion-SHA, startet er `ci.yml` erneut. Echte Branch-Konflikte werden nicht im Promotion-Watchdog überschrieben, sondern durch den separaten `main -> staging`-Rücksync konvergiert.


## Production

Ein Merge nach `main` bedient zwei getrennte Production-Pfade.

### Rücksync von main nach staging

`.github/workflows/sync-main-to-staging.yml` reconciliert `main` kontinuierlich zurück nach `staging`. Er läuft bei Änderungen an `main` oder `staging`, manuell und zusätzlich alle fünf Minuten. Ist `main` bereits Teil der Staging-Historie, wird ein noch offener Sync-PR geschlossen.

Andernfalls erzeugt der Workflow `sync/main-to-staging` **vom aktuellen Staging-Head aus** und merged den aktuellen `main`-Head als zweiten Parent. Dadurch wird nicht mehr ein alter `main`-Zeiger gegen ein schnell weiterlaufendes `staging` gehalten. Läuft `staging` weiter, wird derselbe Sync-PR automatisch auf die neuen beiden Heads reconciled.

Bei echten Textkonflikten gilt für diesen reinen Rücksync bewusst **staging wins**: Der Workflow versucht zunächst einen normalen Merge, protokolliert die Konfliktdateien und wiederholt den Merge bei Bedarf mit der `ort`-Strategie und `-X ours`. Nicht kollidierende Änderungen aus `main` werden übernommen; kollidierende Hunks behalten den neueren Staging-Inhalt. Gleichzeitig wird `main` als Merge-Parent in die Staging-Historie aufgenommen, sodass dieselbe Divergenz nicht wieder auftaucht. Bleiben danach dennoch ungelöste Konflikte übrig, bricht der Workflow ab statt Dateien stillschweigend zu überschreiben.

Der Sync-PR wird weiterhin **nicht automatisch gemergt**. Der Workflow hält ihn lediglich selbstständig konfliktfrei und aktuell und startet die vorhandenen PR-Checks nur dann neu, wenn sich der reconciled Sync-Commit tatsächlich geändert hat.


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

Damit der parallele K3s-Build denselben Commit gefahrlos veröffentlichen kann, verwendet Hetzner für commit-spezifische Images den Tag `<git-sha>-hetzner`. K3s behält den rohen `<git-sha>`-Tag. Die beiden Workflows können dadurch nicht mehr denselben GHCR-Tag gegenseitig überschreiben.

### Ressourcenbewusste K3s-Rollouts

Der K3s-Production-Workflow baut Images nur dann neu, wenn deren tatsächliche Inputs geändert wurden. Eine reine Änderung an HTML, CSS oder Blog-Runtime rollt deshalb nicht mehr automatisch Kernel Grep oder den Status-Service neu aus.

Kernel Grep läuft in Production mit einer Replica. Wegen des hohen RAM-Bedarfs beim Laden des Embedding-Modells verwendet der Search-Rollout `maxSurge: 0` und `maxUnavailable: 1`. Dadurch existieren nicht gleichzeitig zwei speicherintensive Search-Pods auf dem kleinen K3s-Node. Während eines Search-Rollouts kann die Suche kurz nicht verfügbar sein; der Blog selbst soll erreichbar bleiben.

Nach dem GitOps-Publish prüft der Production-Workflow `/healthz` im Sekundentakt. Bereits ein einzelner fehlgeschlagener Healthcheck markiert den Rollout als Downtime. Bei einem Blog-Image-Wechsel muss die neue Build-Version außerdem mehrfach hintereinander beobachtet werden, damit der Canary nicht schon beim ersten neuen Pod beendet wird.

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
