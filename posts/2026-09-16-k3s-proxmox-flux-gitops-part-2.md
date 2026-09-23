---
id: 2026-09-16-k3s-proxmox-flux-gitops-part-2
version: 9
title: 'K3s auf Proxmox – Teil II: GitOps mit Flux und echtem Staging'
status: publish
date: 2026-09-16T00:00:00.000Z
created_at: 2026-09-16T00:00:00.000Z
updated_at: 2026-09-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Teil II zeigt, wie ich mein K3s-Staging automatisiert habe: GitHub Actions
  baut die Images, Git hält den gewünschten Stand fest, Flux rollt ihn aus und
  Production bleibt bewusst manuell.
tags:
  - Kubernetes
  - K3s
  - Proxmox
  - Flux
  - GitOps
  - GitHub-Actions
  - GHCR
  - Kustomize
  - Cloudflare
  - Obsidian
  - DevOps
  - Self-Hosting
search_queries:
  - query: Wie deploye ich automatisch von einem staging Branch mit Flux nach K3s?
    maxRank: 1
  - query: Wie kombiniere ich GitHub Actions GHCR Flux und Kustomize für GitOps?
    maxRank: 1
  - query: >-
      Wie öffne ich nach erfolgreichem Staging Deployment automatisch einen
      Production Pull Request?
    maxRank: 1
snippets:
  - file: 01-kustomize-image-pins.yml
    title: Git-SHA-Images mit Kustomize pinnen
    description: >-
      Zeigt die beiden Image-Einträge, deren Tags der Staging-Workflow auf den
      gebauten Git-SHA setzt.
    type: Kustomize-Ausschnitt
    language: yaml
  - file: 02-staging-deployment-guard.sh
    title: Staging-Deployment auf gemergte PRs begrenzen
    description: >-
      Prüft über die GitHub API, ob der auslösende Commit zu einem gemergten
      Pull Request nach staging gehört.
    type: Shellskript
    language: bash
  - file: 03-flux-precheck.sh
    title: Flux-Version und Voraussetzungen prüfen
    description: >-
      Prüft die installierte Flux CLI und die Kubernetes-Voraussetzungen vor dem
      Bootstrap.
    type: Shellskript
    language: bash
  - file: 04-flux-bootstrap.sh
    title: Flux gegen den staging-Branch bootstrappen
    description: >-
      Bootstrapped Flux für den staging-Branch und den Kubernetes-Staging-Pfad
      mit SSH Deploy Key.
    type: Shellskript
    language: bash
  - file: 05-flux-reconcile-check.sh
    title: Flux-Reconcile und Controller prüfen
    description: 'Zeigt Git Source, Kustomizations und Flux-Controller im Cluster.'
    type: Shellskript
    language: bash
  - file: 06-rollout-image-verification.sh
    title: Staging-Rollout und verwendete Images prüfen
    description: >-
      Prüft Pods und Deployments und gibt die tatsächlich referenzierten Blog-
      und Search-Images aus.
    type: Shellskript
    language: bash
  - file: 07-public-staging-gate.sh
    title: Öffentlichen Staging-Gate prüfen
    description: >-
      Wartet auf Healthcheck, erwartete Build-Version und den Staging-Marker im
      ausgelieferten HTML.
    type: Shellskript
    language: bash
  - file: 08-publish-promotion-candidate.sh
    title: Verifizierten Promotion-Candidate veröffentlichen
    description: >-
      Prüft den verifizierten GitOps-Commit gegen staging und verschiebt
      promotion/staging-verified ohne Force-Push.
    type: Shellskript
    language: bash
  - file: 09-open-promotion-pr.sh
    title: Production-Promotion-PR öffnen oder aktualisieren
    description: >-
      Verwendet den verifizierten Candidate-Branch für den manuellen Pull
      Request nach main.
    type: Shellskript
    language: bash
cover_query: server datacenter infrastructure network cloud container cluster kubernetes
cover_provider: pixabay
cover_provider_id: '8598424'
cover_image: /assets/covers/2026-09-16-k3s-proxmox-flux-gitops-part-2.jpg
cover_alt: >-
  cloud, server, cloud computing, secure, digital, network, business,
  application, connect, modernization, global, privacy, hardware,
  infrastructure, database, security, cloudscape, smart, computer, design,
  backup, automation, internet, cloud data, block chain, cloud, cloud computing,
  cloud computing, cloud computing, cloud computing, cloud computing
cover_focus: center
cover_credit: by kumar111aakashin via Pixabay
cover_credit_url: 'https://pixabay.com/photos/cloud-server-cloud-computing-secure-8598424/'
cover_source_url: 'https://pixabay.com/photos/cloud-server-cloud-computing-secure-8598424/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 93
---
Teil I war der Teil, in dem ich den Blog überhaupt erstmal sauber auf K3s bekommen habe: VM auf Proxmox, K3s, interne Services und der Cloudflare Tunnel bis zum öffentlichen Healthcheck.

Danach hat mich vor allem eins gestört: **Der Cluster lief, aber Deployments hatten noch zu viele Handgriffe.**

Bevor ich den Ablauf zeige, die Begriffe, die in diesem Teil ständig vorkommen:

| Begriff | Kurz erklärt |
| --- | --- |
| **PR / Pull Request** | Ein Vorschlag, Änderungen aus einem Branch in einen anderen zu übernehmen. Vor dem Merge können Checks und Reviews laufen. |
| **CI** | *Continuous Integration*: GitHub Actions prüft Änderungen automatisch, zum Beispiel mit Tests, Linting und Builds. |
| **Container-Image** | Das gebaute Paket, aus dem später ein Container gestartet wird. Blog und Suche haben jeweils ein eigenes Image. |
| **Kernel Grep / Search** | Mein eigener Suchdienst aus Teil I. „Kernel Grep“ und „Search“ meinen in dieser Serie denselben Dienst. |
| **GHCR** | *GitHub Container Registry*: Dort speichere ich die gebauten Container-Images. |
| **Flux** | Ein Dienst im Kubernetes-Cluster, der den gewünschten Zustand aus Git liest und im Cluster umsetzt. |
| **GitOps** | Die gewünschte Konfiguration liegt in Git. Änderungen passieren über Commits und Pull Requests statt über spontane Befehle direkt im Cluster. |
| **Git-SHA** | Die eindeutige Kennung eines Git-Commits, zum Beispiel `a9bc2d…`. Ich hänge sie als Versionsbezeichnung an den Image-Namen, damit ein Build einem Commit zugeordnet werden kann. |
| **Kustomize** | Ein Kubernetes-Werkzeug, das Kubernetes-YAML-Dateien für eine konkrete Umgebung anpasst. Ich nutze es unter anderem für die Image-Tags von Staging. |
| **Pin** | Eine Version bewusst festschreiben, statt immer „die neueste“ zu verwenden. Ein Kustomize-Pin legt hier fest, welches Image Staging benutzen soll. |
| **Reconcile** | Flux vergleicht „was Git sagt“ mit „was im Cluster läuft“ und korrigiert Abweichungen. |
| **Bootstrap** | Die einmalige Ersteinrichtung von Flux: Dienste installieren, Repository verbinden und Branch/Pfad festlegen. |
| **Rollout** | Das Ausrollen einer neuen Version im Cluster: neue Pods starten, alte werden ersetzt und Kubernetes prüft, ob der Wechsel klappt. |


Image bauen, SHA raussuchen, irgendwo eintragen, Rollout prüfen. Das funktioniert. Aber wenn ich zwei Tage später überlegen muss, welcher Commit gerade auf Staging läuft, ist mir das noch zu viel Handarbeit.

## Ziel, Architektur und Stand

Das Ziel von Teil II: **Ich will jederzeit sehen können, welcher Git-Stand auf Staging läuft und genau diesen Stand prüfen, bevor irgendetwas nach Production geht.**

![Architektur Teil II: GitHub Actions baut, Flux rollt Staging aus und nur der öffentlich geprüfte Stand geht Richtung Production](/assets/posts/k3s-proxmox-series/teil-ii-architektur.svg)

Der Weg besteht aus sechs klaren Schritten:

| Schritt | Ziel | Stand |
| --- | --- | --- |
| 1. PR nach `staging` | Änderungen nicht direkt deployen | erledigt |
| 2. Images bauen | Blog und Search eindeutig einem Commit zuordnen | erledigt |
| 3. Kustomize-Pins | gewünschten Image-Stand wieder in Git schreiben | erledigt |
| 4. Flux-Reconcile | Cluster zieht den Sollzustand selbst | erledigt |
| 5. öffentliche Staging-Prüfung | wirklich den erwarteten Staging-Build prüfen | erledigt |
| 6. Production-Freigabe vorbereiten | nur den geprüften Stand nach `main` anbieten | erledigt |

### Was nach Teil II noch offen war

- [ ] GitHub-Regeln so erzwingen, dass direkte Pushes oder ungeprüfte Merges auf den wichtigen Branches blockiert werden.
- [ ] Images später mit ihrem exakten Inhalts-Fingerabdruck statt nur mit einem Tag festschreiben.
- [ ] Search in der öffentlichen Staging-Prüfung separat verifizieren.
- [ ] Secrets aus dem manuellen Cluster-Zustand in GitOps überführen – das ist der nächste Schritt in Teil III.

Also wollte ich den Weg einmal sauber durchziehen:

```text
feature/* / obsidian/*
        ↓ PR + CI
      staging
        ↓
GitHub Actions baut Images
        ↓
GHCR mit Git-SHA-Tags
        ↓
Kustomize-Pins landen wieder in Git
        ↓
Flux zieht den Stand
        ↓
K3s auf Proxmox
        ↓
staging-blog.obivan.org
        ↓
öffentlicher Check
        ↓
promotion/staging-verified
        ↓
PR nach main
        ↓
manueller Merge
```

Production bleibt dabei ganz bewusst auf Hetzner mit Docker Compose. Nur weil ich jetzt Kubernetes im Homelab habe, muss ich nicht sofort alles dorthin umziehen.

## Warum ich überhaupt Flux wollte

Vor Flux war der Ablauf im Kern:

```text
Image bauen
   ↓
SHA kopieren
   ↓
kubectl set image
   ↓
Rollout prüfen
```

Das Problem daran ist nicht, dass `kubectl set image` schlecht wäre. Für Tests ist das super praktisch.

Als dauerhafter Deployment-Weg gefällt mir aber nicht, dass Git und Cluster auseinanderlaufen können. Git sagt dann A, im Cluster läuft B, und die Wahrheit findet man erst mit `kubectl` wieder heraus.

Ich wollte stattdessen:

```text
Git
 ↓
Flux
 ↓
Kubernetes
```

GitHub Actions baut weiterhin die Images. Aber GitHub Actions muss meinen Kubernetes-API-Server nicht erreichen. Der K3s-Node bleibt im internen Netz und Flux zieht sich den gewünschten Zustand selbst.

Das war für mich einer der wichtigsten Punkte an dem ganzen Umbau.

## 1. `staging` ist die Quelle für den Cluster

Flux schaut bei mir auf:

```text
Branch: staging
Pfad:   infra/kubernetes/staging
```

Damit bleibt die Trennung einfach:

```text
staging
   └── Proxmox / K3s

main
   └── Hetzner / Docker Compose
```

Neue Features und Artikel gehen zuerst nach `staging`. Erst wenn der Stand dort wirklich läuft und ich ihn geprüft habe, geht er weiter nach `main`.

## 2. Ein Image gehört zu genau einem Commit

Der Staging-Workflow baut Blog und **Kernel Grep, meinen Suchdienst aus Teil I**, mit dem Git-SHA als Tag:

```text
ghcr.io/0b-ivan/kernel-notes-blog:<git-sha>
ghcr.io/0b-ivan/kernel-notes-search:<git-sha>
```

Zusätzlich gibt es noch den beweglichen `staging`-Tag. Für Kubernetes verwende ich aber den SHA.

Beispiel:

```text
ghcr.io/0b-ivan/kernel-notes-blog:a9bc2daf77e0d5c2fa1e5bafeae95cc0c0428203
```

Damit kann ich vom Pod wieder zurück bis zum Commit gehen:

```text
Commit
  ↓
Image-Tag
  ↓
Kustomize
  ↓
Deployment
```

### SHA-Tag, „immutable“ und Digest – was ist der Unterschied?

Ein **SHA-Tag** ist bei mir ein Container-Tag, dessen Name aus dem Git-SHA kommt. Beispiel: `blog:a9bc2d…`. Damit sehe ich sofort, zu welchem Commit das Image gehört.

„Immutable“ bedeutet **unveränderlich**. Genau das ist ein normaler Registry-Tag aber nicht zwingend: Ein Tag kann technisch später auf ein anderes Image zeigen.

Ein **Digest** ist dagegen der kryptografische Fingerabdruck des tatsächlichen Image-Inhalts:

```text
image@sha256:...
```

Kurz gesagt:

```text
Tag     = lesbares Etikett
Digest  = Fingerabdruck des Inhalts
```

Ein **Digest-Pin** bedeutet: Kubernetes referenziert exakt diesen Fingerabdruck. In meinem aktuellen Aufbau nutze ich noch Git-SHA-Tags; Digest-Pins sind eine spätere Härtung.

## 3. Kustomize hält fest, was Staging laufen soll

Die Image-Namen stehen in den **Basis-Manifesten** – damit meine ich die allgemeinen Kubernetes-YAML-Dateien, die noch nicht auf einen konkreten Staging-Build festgelegt sind. Den konkreten Stand halte ich in:

```text
infra/kubernetes/staging/kustomization.yaml
```

fest.

Das passende Beispiel:

[Git-SHA-Images mit Kustomize pinnen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/01-kustomize-image-pins.yml "snippet:yaml")

Nach dem Build ersetzt der Workflow dort die Tags durch den gerade gebauten Commit-SHA.

Das ist für mich der eigentliche GitOps-Punkt: Nicht der Actions-Run ist die Wahrheit, sondern der Stand im Repository.

## 4. GitHub Actions baut – Flux deployed

Nach einem Merge nach `staging` passiert:

```text
Merge
  ↓
Blog + Search bauen
  ↓
Images nach GHCR
  ↓
Kustomize-Tags aktualisieren
  ↓
Bot-Commit nach staging
  ↓
Flux sieht den Commit
  ↓
Rollout
```

Der Bot-Commit sieht ungefähr so aus:

```text
chore(staging): deploy <sha> [skip ci]
```

`[skip ci]` verhindert, dass dieser Bot-Commit unnötig wieder CI auslöst. Zusätzlich hat der Workflow einen **Pfadfilter**. Das ist einfach eine Liste von Dateipfaden, bei deren Änderungen der Workflow überhaupt starten darf. Reine Änderungen unter `infra/kubernetes/staging/**` lösen den Build aktuell nicht erneut aus.

Ich lasse `[skip ci]` trotzdem drin. So ist direkt sichtbar: Dieser Commit schreibt nur den bereits gebauten Sollzustand zurück und soll keinen neuen Build anstoßen.

## 5. Nicht jeder Push darf automatisch ein Deployment auslösen

Ich wollte außerdem verhindern, dass irgendein direkter Push auf `staging` automatisch den kompletten Build-Pfad startet.

Darum prüft der Workflow, ob der Commit zu einem wirklich gemergten PR mit Ziel `staging` gehört:

[Staging-Deployment auf gemergte PRs begrenzen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/02-staging-deployment-guard.sh "snippet:bash")

Passt das nicht, endet der Workflow mit:

```text
Refusing staging deployment
```

`workflow_dispatch` ist der technische Name für den **manuellen Startknopf eines GitHub-Actions-Workflows**. Den lasse ich absichtlich zu, damit ich einen Lauf bewusst von Hand anstoßen kann.

### Diese Prüfung schützt den Workflow – nicht den Branch

Vorher habe ich das „Guard“ genannt. Gemeint ist nur: Der Workflow prüft vor dem Deployment, ob der Commit wirklich aus einem gemergten Pull Request nach `staging` kommt.

Das ist aber **keine Branch Protection**. Branch Protection beziehungsweise ein Ruleset ist eine GitHub-Regel direkt auf dem Branch. Damit kann GitHub zum Beispiel direkte Pushes verbieten oder erfolgreiche Checks vor einem Merge verlangen.

Meine Workflow-Prüfung greift erst, **wenn der Workflow bereits läuft**. Flux liest Git dagegen direkt. Würde eine Änderung auf anderem Weg direkt in den von Flux beobachteten Pfad gelangen, kann diese Workflow-Prüfung das nicht verhindern.

Darum sind das zwei verschiedene Schutzschichten:

```text
Branch Protection / Ruleset
    schützt den Branch selbst

Workflow-Prüfung
    schützt den automatischen Deployment-Ablauf
```

Bei meinem privaten Repo war das Ruleset zu diesem Zeitpunkt nicht wirksam erzwingbar. Die Workflow-Prüfung ist hilfreich, ersetzt den Branch-Schutz aber nicht.

## 6. Flux installieren, prüfen und dann einmalig einrichten

Mit **Bootstrap** meine ich hier die einmalige Ersteinrichtung von Flux: Die Flux-Dienste werden im Cluster installiert, das GitHub-Repository wird verbunden und Flux bekommt gesagt, welchen Branch und welchen Pfad es beobachten soll.

Die Flux **CLI** – also das Kommandozeilenprogramm `flux` – habe ich nicht einfach blind per `curl | bash` installiert, sondern als konkrete Version und mit Checksum-Prüfung.

Vor dem Bootstrap:

[Flux-Version und Voraussetzungen prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/03-flux-precheck.sh "snippet:bash")

Auf meinem Cluster kam unter anderem:

```text
Kubernetes 1.36.4+k3s1 >=1.33.0-0
prerequisites checks passed
```

Danach der Bootstrap:

[Flux gegen den staging-Branch bootstrappen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/04-flux-bootstrap.sh "snippet:bash")

Entscheidend sind für mich diese beiden Werte:

```text
--branch=staging
--path=infra/kubernetes/staging
```

Mehr Magie steckt dahinter im Grunde nicht: Flux bekommt gesagt, welchen Branch und welchen Pfad es beobachten soll.

## 7. Warum ich keinen persönlichen GitHub-Token im Cluster haben will

Ein **PAT** ist ein *Personal Access Token*, also ein persönlicher Zugriffsschlüssel für GitHub. Je nach Berechtigung kann so ein Token deutlich mehr dürfen als nur dieses eine Repository zu lesen.

Beim Flux-Bootstrap verwende ich deshalb:

```text
--token-auth=false
```

Damit legt Flux für den späteren Repository-Zugriff einen **SSH Deploy Key** an. Ein Deploy Key gehört zu genau diesem Repository und kann hier read-only bleiben.

Die Flux CLI braucht beim einmaligen Einrichten trotzdem GitHub-Zugriff, um diesen Schlüssel zu hinterlegen. Mein persönlicher GitHub-Token wird aber nicht als dauerhaftes Zugangsmittel im Cluster gespeichert.

Ohne `--read-write-key` ist der Deploy Key read-only. Das passt zu meinem Aufbau: Flux liest und deployed; GitHub Actions schreibt Änderungen wie die Kustomize-Pins zurück.

## 8. Nach dem Bootstrap will ich sehen, was wirklich läuft

Nur „Flux ist installiert“ reicht mir nicht.

Ich prüfe danach drei Dinge: die **Git-Quelle** (welches Repository und welcher Branch gelesen werden), die **Kustomization** (welche Manifeste Flux anwenden soll) und die laufenden Flux-Dienste:

[Flux-Zustand und laufende Dienste prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/05-flux-reconcile-check.sh "snippet:bash")

Interessant sind vor allem:

```text
Ready=True
Applied revision: staging@sha1:...
```

Und danach die Workloads selbst:

[Staging-Rollout und verwendete Images prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/06-rollout-image-verification.sh "snippet:bash")

So sehe ich nicht nur, dass ein Pod läuft, sondern auch, **welches Image** er tatsächlich benutzt.

## 9. Staging darf bei mir nicht aussehen wie Production

Das klingt banal, hat mich aber tatsächlich gestört.

Wenn ich Staging im Browser öffne, will ich nicht zweimal auf die URL schauen müssen, um sicher zu sein, wo ich gerade bin.

Darum startet Staging mit `staging-server.js`, Production weiter mit `seo-server.js`.

Staging bekommt:

- `data-environment="staging"`
- `/assets/css/staging.css`
- einen sichtbaren `STAGING`-Banner
- einen Rahmen um den Viewport

Die erste Variante mit `border-image` sah auf WebKit beziehungsweise iPad nicht zuverlässig aus. Deshalb sind es jetzt vier einfache Gradient-Flächen.

Nicht besonders elegant, aber eindeutig. Genau das wollte ich.

## 10. HTTP 200 allein ist mir als Deployment-Test zu wenig

Nach dem Flux-Rollout prüft GitHub Actions die öffentliche Staging-Seite. Diese Prüfung nenne ich im Workflow **Gate**: Erst wenn sie erfolgreich ist, darf der getestete Stand weiter Richtung Production.

Das Blog-Image bekommt dafür eine Build-Version:

```text
<VERSION>-staging.<github-run-number>
```

Von außen prüfe ich dann:

```text
/healthz == ok
/build-info.json.version == erwartete Version
HTML enthält data-environment="staging"
```

Die Logik:

[Öffentlichen Staging-Gate prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/07-public-staging-gate.sh "snippet:bash")

Damit weiß ich nicht nur, dass irgendein Webserver antwortet. Ich sehe, dass genau der erwartete Build öffentlich über den Tunnel kommt und im Staging-Modus läuft.

### Was ich damit noch nicht prüfe

Der Search-Container wird zwar mit demselben SHA gebaut und gepinnt, aber der öffentliche Test verifiziert seine konkrete Image-Version noch nicht separat.

Auch `/healthz` vom Blog ist kein Sammel-Healthcheck für alle Abhängigkeiten.

Das ist also ein guter Gate für den Blog, aber noch kein kompletter End-to-End-Test der ganzen Plattform.

## 11. Der Production-PR darf kein bewegliches Ziel sein

Mit **Promotion** meine ich hier den Übergang von einem geprüften Staging-Stand Richtung Production. Der **Candidate** ist genau der Git-Stand, der diese Prüfung bestanden hat und deshalb für diesen Übergang bereitsteht.

Anfangs lag es nahe, einfach einen PR von `staging` nach `main` offen zu lassen.

Das hat aber einen Haken: `staging` bewegt sich weiter. Dann kann im PR plötzlich mehr landen als der Stand, den ich gerade geprüft habe.

Darum gibt es jetzt:

```text
promotion/staging-verified
```

Der Branch wird erst nach dem erfolgreichen öffentlichen Check weitergeschoben.

[Verifizierten Promotion-Candidate veröffentlichen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/08-publish-promotion-candidate.sh "snippet:bash")

Der Ablauf:

```text
Merge nach staging
      ↓
Images bauen
      ↓
Kustomize-Pins committen
      ↓
Flux rollt aus
      ↓
öffentlicher Check grün
      ↓
promotion/staging-verified
      ↓
PR nach main
```

Wichtig: Der Candidate zeigt auf den **GitOps-Bot-Commit mit den Image-Pins**, nicht nur auf den ursprünglichen Merge-Commit. Das ist der Stand, den Flux wirklich ausgerollt hat.

Der Push auf den Candidate-Branch passiert ohne **Force-Push**. Ein Force-Push würde die bestehende Branch-Historie notfalls überschreiben. Genau das will ich hier vermeiden: Wenn die Historie nicht mehr passt, soll der Workflow lieber rot werden.

## 12. Production bleibt absichtlich ein manueller Klick

Nach erfolgreichem Staging wird der Promotion-PR automatisch angelegt beziehungsweise weitergeführt:

[Production-Promotion-PR öffnen oder aktualisieren](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/09-open-promotion-pr.sh "snippet:bash")

Aber der Merge nach `main` bleibt manuell.

Das ist kein fehlender Automatisierungsschritt. Das ist meine gewünschte Grenze.

```text
Staging automatisch
Production bewusst freigeben
```

Gerade bei meinem Blog reicht mir ein kurzer Blick auf Staging, bevor der Stand live geht.

## 13. Obsidian muss denselben Weg nehmen

Ein zweiter Pfad war mir noch wichtig: Artikel aus Obsidian dürfen die ganze Staging-Kette nicht umgehen. **LiveSync** synchronisiert dabei meinen Obsidian-Vault mit dem Server; der **Publisher** liest den Artikelstatus und erstellt daraus den passenden Git-Branch beziehungsweise Pull Request.

Der Publisher läuft deshalb mit:

```text
PUBLISHER_BASE_BRANCH=staging
```

Ein veröffentlichter Artikel geht damit über:

```text
Obsidian
  ↓
Self-hosted LiveSync
  ↓
Publisher
  ↓
obsidian/<artikel-slug>
  ↓ PR
staging
  ↓
CI + Deployment
  ↓
öffentlicher Check
  ↓
promotion/staging-verified
  ↓
main
```

Die drei Zustände bleiben:

```yaml
status: draft
status: publish
status: archived
```

- `draft`: nicht öffentlich beziehungsweise bereits veröffentlichten Artikel wieder entfernen
- `publish`: unter `posts/` veröffentlichen
- `archived`: nach `archive/` verschieben

Auch das geht zuerst nach `staging`.

### Publisher-Code und Artikel sind zwei verschiedene Dinge

Der Publisher selbst läuft auf dem Hetzner-Server. Änderungen an seiner Software deploye ich weiterhin von `main`.

Der Content, den er erzeugt, geht dagegen nach `staging`.

```text
Publisher-Code:
main → Hetzner

Artikel:
Obsidian → staging → main
```

Das ist bewusst so getrennt.

Beim Umbau ist mir dabei noch ein kleiner Textfehler aufgefallen: Ein generischer PR-Text im Publisher sprach noch von „Merge nach main“, obwohl der Base-Branch bereits `staging` war. Technisch egal, aber genau solche Kleinigkeiten verwirren später beim Debuggen.

## Was mir Teil II am Ende gebracht hat

Vorher musste ich beim Deployment mehrere Dinge selbst zusammensuchen.

Jetzt ist der normale Weg:

```text
PR
 ↓
staging
 ↓
Build
 ↓
GHCR
 ↓
Kustomize-Pins
 ↓
Flux
 ↓
öffentlicher Check
 ↓
verifizierter Candidate
 ↓
manueller Production-Merge
```

Was ich im normalen Ablauf nicht mehr brauche:

- SHA manuell kopieren
- `kubectl set image`
- `kubectl rollout restart`
- `flux reconcile` von Hand
- Promotion-PR manuell anlegen
- Obsidian direkt gegen `main` veröffentlichen

## Was noch nicht fertig ist

GitOps heißt nicht, dass damit automatisch alles gehärtet ist.

Offen sind weiterhin:

```text
kein wirksam erzwungener Branch-Schutz auf staging
kein wirksam erzwungener Schutz für promotion/staging-verified
SHA-Tags sind keine echten Digest-Pins
Search wird im öffentlichen Gate noch nicht separat geprüft
Secrets brauchen einen besseren GitOps-Weg
K3s-Version und Installer sollen reproduzierbar gepinnt werden
Backup + Restore sind noch nicht getestet
Monitoring und Alerting fehlen
```

Genau daraus ist Teil III entstanden.

## Der komplette Weg

```text
                 Obsidian
                    │
                    ▼
             Self-hosted LiveSync
                    │
                    ▼
                 Publisher
                    │
                    ▼
feature/* / obsidian/*
                    │
                    ▼
                 staging
                    │
                    ▼
              GitHub Actions
               │           │
               │           └── Search Image
               └────────────── Blog Image
                    │
                    ▼
                   GHCR
                    │
                    ▼
          Kustomize SHA-Pins in Git
                    │
                    ▼
                   Flux
                    │
                    ▼
             K3s auf Proxmox
                    │
                    ▼
               cloudflared
                    │
                    ▼
        staging-blog.obivan.org
                    │
                    ▼
             öffentlicher Check
                    │
                    ▼
       promotion/staging-verified
                    │
                    ▼
                PR → main
                    │
                    ▼
              manueller Merge
                    │
                    ▼
          Hetzner Production
```

Für mich ist das der eigentliche Gewinn: Ich kann an jeder Stelle sehen, **welcher Stand gerade wo liegt**.

Nicht Flux allein macht das Setup besser. Die Kette wird einfach nachvollziehbar.

---

## Weiter in Teil III

Teil III kümmert sich um die Sachen, die ich bis hierhin bewusst liegen gelassen habe: feste K3s-Versionen, verschlüsselte Secrets in Git, Backup und Restore sowie Monitoring.

**Fortsetzung: Teil III – K3s im Homelab härten: feste Versionen und verschlüsselte Secrets.**

<!-- series-next: k3s-proxmox-part-3-hardening-secrets-backups-observability -->
