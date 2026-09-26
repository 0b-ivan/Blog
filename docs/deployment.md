# Publication und Release

Kernel Notes behandelt **Article Publication** und **Software Release** als zwei unabhängige Lebenszyklen. Eine Publication verändert genau einen Artikelzustand und niemals die Software-Version. Ein Release bündelt Software-/Runtime-/Infra-Änderungen und verändert SemVer, transportiert aber keine unveröffentlichten Artikel nach Production.

## Branch-Modell

Beide Pfade verwenden `staging` zum Testen, trennen sich danach aber bewusst.

### Article Publication

```text
Obsidian / content PR
        |
        v
     staging
        |
        | Deploy Staging + öffentlicher Gate
        v
publish-article.yml
        |
        | genau 1 Artikel + Runtime-Assets
        v
publication/<slug> -> main
        |
        | manueller Merge
        v
kernel-notes-content:<publication-sha>
        |
        v
production-gitops content pin
```

### Software Release

```text
feature PRs
    |
    v
 staging
    |
    | mehrere Features/Fixes sammeln
    v
release-production.yml
    |
    | manueller Release-Cut: patch/minor/major
    | Content-Pfade werden ausgeschlossen
    v
release/vX.Y.Z -> main
    |
    | manueller Merge
    v
cd-k8s-production.yml
```

Ein Software-Release und eine Article Publication können zeitlich unabhängig voneinander stattfinden. `main` enthält sowohl veröffentlichte Artikelstände als auch freigegebene Softwarestände; die Production-Runtime verwendet dafür jedoch getrennte immutable Images.

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

Reine GitOps-, Workflow-, Test- und Dokumentationsänderungen können die bereits gepinnten Images wiederverwenden. Der Staging-Workflow führt weiterhin den öffentlichen Availability-Gate aus. Nach erfolgreicher Verifikation erzeugt er selbst **keinen** Production-Release mehr. Er übergibt lediglich den verifizierten Source-SHA und den auslösenden Staging-PR an `.github/workflows/publish-article.yml`; dieser Workflow entscheidet, ob es sich um eine zulässige Ein-Artikel-Publication handelt.

## Staging-Gate

Ein Staging-Stand ist erst dann promotionsfähig, wenn die öffentlich erreichbare Umgebung den erwarteten Build tatsächlich ausliefert.

Der Gate prüft unter anderem:

- `/healthz`
- `/build-info.json`
- die erwartete Staging-Version
- die sichtbare Staging-Kennzeichnung

Nach erfolgreicher Prüfung sind zwei getrennte Aktionen möglich:

**Article Publication:** `.github/workflows/publish-article.yml` akzeptiert nur Content-PRs, die genau einen Artikel unter `posts/` oder `archive/` betreffen. Aus dem aktuellen `main` wird ein Branch `publication/<slug>` erstellt und ausschließlich der verifizierte Artikelzustand plus zugehörige Assets aus Staging übernommen. `VERSION` darf dabei nicht verändert werden. Der resultierende PR trägt `publish: <Titel>`.

**Software Release:** `.github/workflows/release-production.yml` wird bewusst separat als Release-Cut gestartet. Er sammelt die Software-Differenz zwischen `main` und `staging`, schließt Content-Pfade sowie Staging-only-GitOps aus und erhöht SemVer wahlweise als `patch`, `minor` oder `major`. Der resultierende Branch heißt `release/vX.Y.Z`.

Es gibt keinen beweglichen `promotion/staging-verified`-Branch mehr. Required Checks laufen jeweils auf dem konkreten Publication- oder Release-PR. Weil beide PR-Typen parallel zu `main` offen sein dürfen, repariert `.github/workflows/production-pr-reconciler.yml` ausschließlich deren Required-Check-Spiegelung, falls ein unabhängiger Merge nach `main` GitHubs synthetischen Merge-Commit neu erzeugt. Er verändert weder Publication-Inhalt noch Release-Inhalt.



## Production

Ein Merge nach `main` kann entweder eine Article Publication oder einen Software Release darstellen. Die Workflows reagieren anhand klar getrennter Pfade.

### Rücksync von main nach staging

`.github/workflows/sync-main-to-staging.yml` reconciliert `main` kontinuierlich zurück nach `staging`. Er läuft bei Änderungen an `main` oder `staging`, manuell und zusätzlich mit einem stündlichen Fallback. Ist `main` bereits Teil der Staging-Historie, wird ein noch offener Sync-PR geschlossen.

Andernfalls erzeugt der Workflow `sync/main-to-staging` **vom aktuellen Staging-Head aus** und merged den aktuellen `main`-Head als zweiten Parent. Dadurch wird nicht mehr ein alter `main`-Zeiger gegen ein schnell weiterlaufendes `staging` gehalten. Läuft `staging` weiter, wird derselbe Sync-PR automatisch auf die neuen beiden Heads reconciled.

Bei echten Textkonflikten gilt für diesen reinen Rücksync bewusst **staging wins**: Der Workflow versucht zunächst einen normalen Merge, protokolliert die Konfliktdateien und wiederholt den Merge bei Bedarf mit der `ort`-Strategie und `-X ours`. Nicht kollidierende Änderungen aus `main` werden übernommen; kollidierende Hunks behalten den neueren Staging-Inhalt. Gleichzeitig wird `main` als Merge-Parent in die Staging-Historie aufgenommen, sodass dieselbe Divergenz nicht wieder auftaucht. Bleiben danach dennoch ungelöste Konflikte übrig, bricht der Workflow ab statt Dateien stillschweigend zu überschreiben.

Der Sync-PR wird weiterhin **nicht automatisch gemergt**. Der Workflow hält ihn lediglich selbstständig konfliktfrei und aktuell und startet die vorhandenen PR-Checks nur dann neu, wenn sich der reconciled Sync-Commit tatsächlich geändert hat.


### K3s Production

`.github/workflows/cd-k8s-production.yml` baut für den freigegebenen `main`-Commit immutable Images für:

- Blog
- Kernel Grep
- Kubernetes-Status

Die Datei `VERSION` gehört ausschließlich zum Software-Release. Eine Article Publication darf sie nicht verändern. Staging kann weiterhin technische Pre-Release-Kennungen wie `2.2.1-staging.163` anzeigen; Production zeigt die zuletzt freigegebene SemVer-Version unabhängig davon, wie viele Artikel seitdem publiziert wurden.

Git-SHAs bleiben für technische Rückverfolgbarkeit erhalten, aber nicht als Produktversion: die Production-Images werden weiterhin unveränderlich auf den exakten `main`-SHA getaggt und in GitOps gepinnt.

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

## Article Publication Runtime

K3s verwendet für veröffentlichte Inhalte ein eigenes immutable Artefakt:

```text
kernel-notes-content:<publication-sha>
```

Das Content-Image enthält den veröffentlichten Snapshot aus `posts/`, `archive/`, `snippets/`, Artikel-Assets, Cover und Post-History. Die Production-Deployments von Blog, Kernel Grep und PDF besitzen jeweils einen Init-Container, der dieses Artefakt in ein `emptyDir` kopiert. Die eigentlichen Software-Container mounten nur die benötigten Content-Unterpfade.

Damit sind die Pins getrennt:

```text
Software Release:
  kernel-notes-blog:<release-sha>
  kernel-notes-search:<release-sha>
  kernel-notes-pdf:<release-sha>

Article Publication:
  kernel-notes-content:<publication-sha>
```

`.github/workflows/publish-content-production.yml` baut das Content-Image nach dem Merge eines Publication-PRs und verändert in `production-gitops` ausschließlich den `kernel-notes-content`-Pin. Die sichtbare Software-Version muss während dieser Publication unverändert bleiben.

Ein Software-Release übernimmt dagegen den bereits aktiven Content-Pin aus `production-gitops`. Nur beim ersten Rollout dieser Architektur wird das Content-Artefakt einmalig gebootstrapped.

Hetzner bleibt als Standby-Origin erhalten. Sein bestehender Content-Sync kann Content weiterhin ohne Software-Rebuild aktualisieren.

## Rollback

K3s ist durch immutable SHA-Tags und den separaten `production-gitops`-Zustand reproduzierbar.

Hetzner bleibt zusätzlich aktuell, sodass ein Standby-Origin ohne vorherigen Restore vorhanden ist.

Ein automatischer Failover zwischen K3s und Hetzner ist aktuell noch nicht implementiert. Die geplante vorgeschaltete HAProxy-/Failover-Schicht ist deshalb als zukünftiger Ausbau und nicht als bestehende Betriebsfunktion zu behandeln.

## Manuelle Deployments

Die Workflows besitzen `workflow_dispatch` für kontrollierte manuelle Ausführungen. Ein Software-Release wird über den dedizierten Release-Cut gestartet; Article Publications entstehen aus verifizierten Ein-Artikel-Staging-PRs.

## Secrets

Secrets werden weder in Kubernetes-Manifeste noch in die Dokumentation committed.

Staging und Production verwenden dafür die vorgesehenen GitHub-/Cluster-Secrets beziehungsweise verschlüsselte Secret-Manifeste. Konkrete Bootstrap-Anweisungen stehen in den jeweiligen Infra-READMEs.
