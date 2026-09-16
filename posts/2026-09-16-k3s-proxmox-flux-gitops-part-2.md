---
id: 2026-09-16-k3s-proxmox-flux-gitops-part-2
version: 5
title: "K3s auf Proxmox – Teil II: GitOps mit Flux und echtem Staging"
status: publish
date: 2026-09-16
created_at: 2026-09-16
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Teil II baut aus dem K3s-Staging einen GitOps-Workflow: SHA-getaggte Images, Kustomize-Pins, Flux, öffentlicher Deployment-Gate, verifizierter Promotion-Candidate, Obsidian-Publishing und eine bewusst manuelle Production-Freigabe."
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
  - query: Wie öffne ich nach erfolgreichem Staging Deployment automatisch einen Production Pull Request?
    maxRank: 1
snippets:
  - file: "01-kustomize-image-pins.yml"
    title: "Git-SHA-Images mit Kustomize pinnen"
    description: "Zeigt die beiden Image-Einträge, deren Tags der Staging-Workflow auf den gebauten Git-SHA setzt."
    type: "Kustomize-Ausschnitt"
    language: "yaml"
  - file: "02-staging-deployment-guard.sh"
    title: "Staging-Deployment auf gemergte PRs begrenzen"
    description: "Prüft über die GitHub API, ob der auslösende Commit zu einem gemergten Pull Request nach staging gehört."
    type: "Shellskript"
    language: "bash"
  - file: "03-flux-precheck.sh"
    title: "Flux-Version und Voraussetzungen prüfen"
    description: "Prüft die installierte Flux CLI und die Kubernetes-Voraussetzungen vor dem Bootstrap."
    type: "Shellskript"
    language: "bash"
  - file: "04-flux-bootstrap.sh"
    title: "Flux gegen den staging-Branch bootstrappen"
    description: "Bootstrapped Flux für den staging-Branch und den Kubernetes-Staging-Pfad mit SSH Deploy Key."
    type: "Shellskript"
    language: "bash"
  - file: "05-flux-reconcile-check.sh"
    title: "Flux-Reconcile und Controller prüfen"
    description: "Zeigt Git Source, Kustomizations und Flux-Controller im Cluster."
    type: "Shellskript"
    language: "bash"
  - file: "06-rollout-image-verification.sh"
    title: "Staging-Rollout und verwendete Images prüfen"
    description: "Prüft Pods und Deployments und gibt die tatsächlich referenzierten Blog- und Search-Images aus."
    type: "Shellskript"
    language: "bash"
  - file: "07-public-staging-gate.sh"
    title: "Öffentlichen Staging-Gate prüfen"
    description: "Wartet auf Healthcheck, erwartete Build-Version und den Staging-Marker im ausgelieferten HTML."
    type: "Shellskript"
    language: "bash"
  - file: "08-publish-promotion-candidate.sh"
    title: "Verifizierten Promotion-Candidate veröffentlichen"
    description: "Prüft den verifizierten GitOps-Commit gegen staging und verschiebt promotion/staging-verified ohne Force-Push."
    type: "Shellskript"
    language: "bash"
  - file: "09-open-promotion-pr.sh"
    title: "Production-Promotion-PR öffnen oder aktualisieren"
    description: "Verwendet den verifizierten Candidate-Branch für den manuellen Pull Request nach main."
    type: "Shellskript"
    language: "bash"
---

Teil I hat die technische Basis geschaffen: Debian auf Proxmox, K3s, interne Services und einen Cloudflare Tunnel bis zum öffentlichen Healthcheck.

Teil II entfernt nun den manuellen Deployment-Pfad.

Der Zielzustand ist:

```text
feature/* / obsidian/*
        ↓ PR + CI
      staging
        ↓
GitHub Actions baut Images
        ↓
GHCR mit Git-SHA-Tags
        ↓
Kustomize-Pins werden aktualisiert
        ↓
Git enthält den gewünschten Zustand
        ↓
Flux reconciliert
        ↓
K3s auf Proxmox
        ↓
staging-blog.obivan.org
        ↓
öffentlicher Deployment-Gate
        ↓
promotion/staging-verified
        ↓
Promotion-PR Richtung main
        ↓
manuelle Production-Freigabe
```

Production bleibt weiterhin auf Hetzner mit Docker Compose. Kubernetes ist in diesem Aufbau zunächst ausschließlich die Staging-Plattform.

## Was GitOps hier konkret verändert

Vor Flux sah ein Deployment sinngemäß so aus:

```text
Image bauen
   ↓
SHA kopieren
   ↓
kubectl set image
   ↓
Rollout prüfen
```

Damit existieren zwei Zustände:

```text
Git
Cluster
```

und beide können voneinander abweichen.

Mit Flux wird Git zur Quelle für den gewünschten Cluster-Zustand:

```text
Git
 ↓
Flux
 ↓
Kubernetes
```

GitHub Actions baut weiterhin die Images, greift aber nicht auf den Kubernetes-API-Server zu. Der K3s-Node hängt im internen Netz und muss von GitHub Actions nicht erreichbar sein.

Für den normalen Deployment-Pfad ist deshalb kein öffentlicher Kubernetes-API-Port notwendig.

## 1. staging wird zur GitOps-Quelle

Der K3s-Cluster beobachtet nicht `main`, sondern:

```text
Branch: staging
Pfad:   infra/kubernetes/staging
```

Damit sind Staging und Production klar getrennt:

```text
staging
   └── Proxmox / K3s

main
   └── Hetzner / Docker Compose
```

Code oder Content gelangt zunächst über einen Pull Request nach `staging`. Erst ein späterer, manueller Merge nach `main` verändert Production.

## 2. Images bekommen einen Git-SHA-Tag

Der Staging-Workflow baut Blog und Kernel Grep mit dem Commit-SHA als Tag:

```text
ghcr.io/0b-ivan/kernel-notes-blog:<git-sha>
ghcr.io/0b-ivan/kernel-notes-search:<git-sha>
```

Zusätzlich wird ein beweglicher `staging`-Tag geschrieben. Für den Kubernetes-Sollzustand wird aber der SHA-Tag verwendet.

Beispiel:

```text
ghcr.io/0b-ivan/kernel-notes-blog:a9bc2daf77e0d5c2fa1e5bafeae95cc0c0428203
```

Damit lässt sich der Zusammenhang direkt nachvollziehen:

```text
Git Commit
    ↓
Image-Tag
    ↓
Kustomize-Pin
    ↓
Deployment
```

### SHA-getaggt ist nicht automatisch unveränderlich

Ein Git-SHA-Tag ist **commit-eindeutig**, aber damit noch nicht technisch unveränderlich. Ein Registry-Tag kann grundsätzlich erneut auf ein anderes Image geschrieben werden, wenn Registry und Berechtigungen das zulassen.

Der aktuelle Aufbau gewinnt also vor allem Nachvollziehbarkeit durch eindeutige Tags.

Eine noch strengere Variante wäre später ein Pin auf den Image-Digest:

```text
image@sha256:...
```

Dann referenziert Kubernetes direkt den konkreten Image-Inhalt und nicht nur einen Tag-Namen.

## 3. Kustomize speichert den gewünschten Image-Stand

Die Basis-Manifeste enthalten die Image-Namen. Der aktuell gewünschte Staging-Stand wird in `infra/kubernetes/staging/kustomization.yaml` festgehalten.

Das wiederverwendbare Beispiel liegt als Snippet vor:

[Git-SHA-Images mit Kustomize pinnen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/01-kustomize-image-pins.yml "snippet:yaml")

Nach einem erfolgreichen Build ersetzt der Workflow beide Tags durch den SHA des gerade gebauten Commits.

Damit ist nicht der GitHub-Actions-Run selbst der dauerhafte Sollzustand. Der Sollzustand steht wieder in Git.

## 4. GitHub Actions schreibt den Sollzustand zurück

Der Ablauf besteht deshalb aus zwei Git-Ständen:

```text
Merge nach staging
        ↓
GitHub Actions baut Blog + Search
        ↓
Images landen in GHCR
        ↓
Kustomize bekommt die SHA-Tags
        ↓
Bot-Commit nach staging
```

Der Bot-Commit sieht beispielsweise so aus:

```text
chore(staging): deploy <sha> [skip ci]
```

Danach erkennt Flux die Änderung im GitOps-Pfad und reconciliert den Cluster.

### Warum `[skip ci]` hier nur eine zusätzliche Sicherung ist

Im Workflow gibt es außerdem einen `paths`-Filter. `infra/kubernetes/staging/**` gehört aktuell nicht zu den Pfaden, die den Staging-Build auslösen.

Der reine Kustomize-Bot-Commit würde den Build deshalb bereits wegen dieses Filters nicht erneut starten.

`[skip ci]` bleibt trotzdem sinnvoll: Es dokumentiert die Absicht und bietet eine zweite Sicherung gegen unnötige CI-Läufe, falls die Pfadfilter später erweitert werden.

Es ist aber nicht korrekt, `[skip ci]` allein als Schleifenbremse zu beschreiben.

## 5. Der automatische Deployment-Guard

Bei normalen Push-Events prüft der Workflow, ob der Commit zu einem gemergten Pull Request mit Zielbranch `staging` gehört.

Die vollständige Prüfung ist als Snippet ausgelagert:

[Staging-Deployment auf gemergte PRs begrenzen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/02-staging-deployment-guard.sh "snippet:bash")

Akzeptiert wird nur ein verknüpfter PR mit `merged_at != null` und `base.ref == staging`. Andernfalls endet der automatische Workflow mit `Refusing staging deployment`.

`workflow_dispatch` bleibt davon bewusst ausgenommen und kann manuell gestartet werden.

### Wichtig: Das ist keine Branch Protection

Der Guard schützt nur den GitHub-Actions-Pfad.

Zum Zeitpunkt dieses Aufbaus ist `staging` im Repository nicht durch GitHub Branch Protection beziehungsweise ein tatsächlich erzwungenes Ruleset geschützt.

Das hat eine wichtige Konsequenz: Flux beobachtet Git direkt. Eine direkte Änderung an `infra/kubernetes/staging/**` könnte deshalb von Flux übernommen werden, ohne dass der oben beschriebene Build-Guard beteiligt ist.

Der Guard verhindert also nicht jeden denkbaren Direkt-Deploy. Er ist eine zusätzliche Schranke für den automatischen Build-Workflow.

Sauberer wäre langfristig:

```text
Branch Protection / enforced Ruleset
        +
Deployment-Guard
```

Die Pipeline sollte nicht als Ersatz für Repository-Schutz verstanden werden.

## 6. Flux CLI installieren und prüfen

Für den Bootstrap wurde Flux CLI 2.9.5 auf einem Admin-Host installiert und der Download per Checksumme geprüft.

Vor dem Bootstrap werden Version und Voraussetzungen geprüft:

[Flux-Version und Voraussetzungen prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/03-flux-precheck.sh "snippet:bash")

Im verwendeten Cluster meldete der Pre-Check unter anderem:

```text
Kubernetes 1.36.4+k3s1 >=1.33.0-0
prerequisites checks passed
```

Der Admin-Host benötigt für diesen Schritt Zugriff auf den Kubernetes-API-Server und GitHub. Der spätere normale Deployment-Pfad benötigt diesen Admin-Host nicht mehr.

## 7. Flux gegen den staging-Branch bootstrappen

Der verwendete Bootstrap liegt als ausführbares Snippet vor:

[Flux gegen den staging-Branch bootstrappen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/04-flux-bootstrap.sh "snippet:bash")

Die zwei entscheidenden Parameter sind:

```text
--branch=staging
--path=infra/kubernetes/staging
```

Flux legt dabei seine eigenen Bootstrap-Manifeste unterhalb des GitOps-Pfads ab und konfiguriert den Cluster so, dass genau dieser Repository-Bereich reconciliert wird.

## 8. SSH Deploy Key statt GitHub-PAT als Cluster-Credential

Mit `--token-auth=false` verwendet Flux für den laufenden Git-Zugriff einen SSH Deploy Key.

Während des Bootstrap-Vorgangs braucht die Flux CLI weiterhin eine passende GitHub-Authentifizierung, um Repository-Konfiguration und Deploy Key einzurichten.

Der persönliche GitHub-Token wird aber nicht als dauerhaftes Git-Credential im Cluster verwendet.

Ohne `--read-write-key` wird der von Flux angelegte GitHub Deploy Key standardmäßig read-only verwendet. Das passt hier, weil Flux nur den gewünschten Zustand lesen und anwenden soll. Das Zurückschreiben der Kustomize-Pins übernimmt GitHub Actions.

Im Cluster liegt die private SSH-Seite der Git-Verbindung im `flux-system` Secret.

## 9. Prüfen, ob Flux wirklich reconciliert

Source, Kustomization und Controller lassen sich mit einem gemeinsamen Diagnose-Snippet prüfen:

[Flux-Reconcile und Controller prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/05-flux-reconcile-check.sh "snippet:bash")

Source und Kustomization sollten `Ready=True` melden. Zusätzlich lässt sich die angewendete Revision nachvollziehen:

```text
Applied revision: staging@sha1:...
```

Damit ist belegt, welchen Git-Stand Flux zuletzt erfolgreich verarbeitet hat. Für tiefergehende Fehleranalyse sind anschließend die Logs von `source-controller` und `kustomize-controller` relevant.

## 10. Der erste automatische Rollout

Nach einem Merge nach `staging` läuft nun diese Kette:

```text
Merge Commit
   ↓
GitHub Actions
   ↓
Blog Image + Search Image
   ↓
GHCR
   ↓
Kustomize SHA-Pins
   ↓
Bot-Commit
   ↓
Flux
   ↓
Kubernetes Deployment
```

Pods, Deployments und die tatsächlich verwendeten Images werden gemeinsam geprüft:

[Staging-Rollout und verwendete Images prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/06-rollout-image-verification.sh "snippet:bash")

Die ausgegebenen SHA-Tags sollten mit den Pins in `kustomization.yaml` übereinstimmen.

## 11. Staging muss optisch eindeutig sein

Nur Staging startet den Blog mit `staging-server.js`; Production verwendet weiterhin `seo-server.js`.

Der Staging-Server ergänzt am ausgelieferten HTML `data-environment="staging"` und injiziert `/assets/css/staging.css`. Zusätzlich erscheint ein sichtbarer `STAGING`-Banner.

Der Rahmen um den Viewport verwendet vier explizite Gradient-Flächen für oben, unten, links und rechts. Die vorherige Variante mit `border-image` war auf WebKit nicht zuverlässig genug.

Der Marker erfüllt damit zwei Aufgaben:

```text
Mensch erkennt Staging sofort
        +
Pipeline kann Staging maschinell erkennen
```

## 12. Der öffentliche Deployment-Gate

Nach dem Bot-Commit wartet GitHub Actions auf die öffentlich erreichbare Staging-Instanz.

Das Blog-Image erhält beim Build eine Versionskennung nach dem Muster `<VERSION>-staging.<github-run-number>`. Diese landet im Image unter `/build-info.json`.

Der Workflow prüft von außen drei Signale:

```text
/healthz == ok
/build-info.json.version == erwartete Build-Version
HTML enthält data-environment="staging"
```

Die vollständige Gate-Logik liegt als Snippet vor:

[Öffentlichen Staging-Gate prüfen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/07-public-staging-gate.sh "snippet:bash")

Damit wird mehr geprüft als nur ein HTTP-200. Der Gate belegt, dass **das neu gebaute Blog-Image** über Cloudflare öffentlich ausgeliefert wird und tatsächlich im Staging-Modus läuft.

### Was dieser Gate nicht beweist

Der Search-Container wird im selben Workflow gebaut und auf denselben Git-SHA gepinnt. Der öffentliche Smoke-Test prüft seine konkrete Image-Version aber nicht separat.

Auch `/healthz` des Blogs liefert nur den Zustand des Blog-Prozesses und ist kein aggregierter Healthcheck aller Abhängigkeiten.

Für einen strengeren End-to-End-Gate wäre später beispielsweise eine echte öffentliche Search-Anfrage oder ein separater Search-Readiness-Test sinnvoll.

## 13. Verifizierten Promotion-Candidate veröffentlichen

Der Production-PR zeigt nicht mehr direkt auf den beweglichen `staging`-Branch.

Nach dem erfolgreichen öffentlichen Gate nimmt der Workflow den GitOps-Commit, der die gerade getesteten Kustomize-Pins enthält, und veröffentlicht genau diesen Stand auf `promotion/staging-verified`.

Die konkrete Prüfung und der Fast-Forward-Push sind ausgelagert:

[Verifizierten Promotion-Candidate veröffentlichen](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/08-publish-promotion-candidate.sh "snippet:bash")

Der Ablauf ist damit:

```text
staging Merge
     ↓
Images bauen
     ↓
Kustomize-Pins committen
     ↓
Flux reconciliert
     ↓
öffentlicher Gate erfolgreich
     ↓
promotion/staging-verified
     ↓
PR nach main
     ↓
manueller Merge
```

Wichtig ist die Reihenfolge: Der Candidate-Branch wird **erst nach** dem erfolgreichen öffentlichen Gate weitergeschoben.

Der Workflow prüft zusätzlich, ob der verifizierte GitOps-Commit tatsächlich Teil der aktuellen `staging`-Historie ist. Der Push auf `promotion/staging-verified` erfolgt ohne Force-Push. Sollte der Branch unerwartet von der Staging-Historie divergieren, schlägt die Promotion fehl, statt einen bestehenden Candidate still zu überschreiben.

### Warum der Candidate auf den GitOps-Commit zeigt

Gebaut werden die Images aus dem ursprünglichen Merge-Commit. Danach schreibt GitHub Actions diese Image-SHAs aber noch in `infra/kubernetes/staging/kustomization.yaml` und erzeugt dafür einen separaten Bot-Commit.

Genau dieser Bot-Commit beschreibt den Zustand, den Flux ausrollt:

```text
Merge Commit
   ↓ Image Build
Bot-Commit mit Kustomize-Pins
   ↓ Flux
öffentlicher Gate
   ↓
promotion/staging-verified
```

Damit enthält der Production-PR den tatsächlich getesteten Sollzustand.

## 14. Promotion nach main bleibt manuell

Nach dem erfolgreichen Gate sucht der Workflow nach einem offenen Pull Request mit `head: promotion/staging-verified` und `base: main`.

Die Logik zum Aktualisieren beziehungsweise Erzeugen dieses PRs liegt ebenfalls als Snippet vor:

[Production-Promotion-PR öffnen oder aktualisieren](/snippets/2026-09-16-k3s-proxmox-flux-gitops-part-2/09-open-promotion-pr.sh "snippet:bash")

Existiert noch kein PR, wird `promote: verified staging to production` angelegt. Existiert bereits einer, bleibt derselbe PR offen und der Candidate-Branch wird erst beim nächsten **erfolgreich verifizierten** Staging-Stand weitergeschoben. Ungeprüfte Commits auf `staging` landen damit nicht automatisch im Production-PR.

Der letzte Schritt bleibt bewusst manuell:

```text
Promotion-Candidate automatisch
Production-Merge manuell
```

Ein erfolgreicher Staging-Gate ist damit Voraussetzung für einen neuen Production-Candidate, aber keine automatische Freigabe für Production.

## 15. Obsidian veröffentlicht jetzt nach staging

Die Artikel entstehen teilweise in Obsidian und werden über Self-hosted LiveSync mit dem Vault synchronisiert.

Der Publisher bekommt auf dem Server `PUBLISHER_BASE_BRANCH=staging`. Damit führt `status: publish` nicht mehr direkt zu einem PR gegen `main`.

Der Content-Pfad ist nun:

```text
Obsidian
  ↓
Publisher
  ↓
obsidian/<artikel-slug>
  ↓ PR
staging
  ↓
CI + Staging Deployment
  ↓
öffentlicher Gate
  ↓
promotion/staging-verified
  ↓
Promotion-PR Richtung main
```

Der Branch-Name ist deterministisch. Weitere Änderungen am selben Artikel aktualisieren deshalb denselben offenen Pull Request.

## 16. draft, publish und archived bleiben getrennt

Der Publisher reagiert auf drei Zustände:

```yaml
status: draft
status: publish
status: archived
```

`draft` entfernt einen bereits veröffentlichten Artikel über einen PR wieder aus `posts/` beziehungsweise `archive/`.

`publish` legt den Artikel unter `posts/` ab oder holt ihn aus dem Archiv zurück.

`archived` verschiebt ihn nach `archive/`.

Auch diese Änderungen gehen gegen `staging` und nicht direkt gegen Production.

## 17. Publisher-Software und Content haben unterschiedliche Deployment-Grenzen

Der **Content-Publisher** erstellt Pull Requests nach `staging`.

Die **Publisher-Software selbst** läuft aber auf dem Hetzner-System. Änderungen an dieser Software werden weiterhin über den Workflow `Deploy Obsidian Publisher` von `main` aus auf den Server deployed.

Das ist kein Widerspruch:

```text
Publisher-Code
main → Hetzner

Artikel-Content
Obsidian → PR nach staging
```

Auch der Rückweg zum Vault bleibt Production-basiert. `sync-main-to-obsidian.yml` reagiert weiterhin auf Änderungen an `main`.

Damit wird erst der tatsächlich nach Production gemergte Content zurück in den Obsidian-Vault gespiegelt.

## 18. Ein kleiner Inkonsistenz-Fund im Publisher

Die Runtime-Konfiguration zeigt korrekt auf `staging`. Im generischen Publisher-Code existiert jedoch weiterhin ein Textbaustein für automatisch erzeugte PR-Beschreibungen, der von „Merge nach main“ spricht.

Das verändert nicht den tatsächlichen Base-Branch des Pull Requests, ist aber redaktionell irreführend.

Der Base-Branch wird technisch durch `PUBLISHER_BASE_BRANCH=staging` bestimmt. Der Textbaustein sollte separat auf eine neutrale Formulierung wie „nach Merge dieses PR“ umgestellt werden.

## Was nach Teil II automatisch läuft

Der normale Weg benötigt keine manuellen `kubectl set image`-Kommandos mehr:

```text
PR prüfen
   ↓
Merge nach staging
   ↓
Images bauen
   ↓
GitOps-Pins aktualisieren
   ↓
Flux reconciliert
   ↓
öffentlichen Staging-Gate prüfen
   ↓
verifizierten Promotion-Candidate setzen
   ↓
Promotion-PR
   ↓
manueller Merge nach main
```

Nicht mehr Teil des normalen Ablaufs sind manuelles SHA-Kopieren, `kubectl set image`, `kubectl rollout restart`, manuelles `flux reconcile`, manuelles Anlegen des Promotion-PRs und ein Obsidian-PR direkt nach `main`.

## Aktuelle Grenzen des Aufbaus

Teil II ist ein funktionierender GitOps-Pfad, aber noch nicht die endgültige Härtung.

Offen bleiben unter anderem:

```text
staging ist noch nicht wirksam branch-geschützt
promotion/staging-verified ist ebenfalls nicht wirksam branch-geschützt
SHA-Tags sind nachvollziehbar, aber nicht registry-seitig immutable
öffentlicher Gate prüft das Blog-Image, Search nicht separat
Secrets sind noch nicht vollständig automatisiert verwaltet
K3s-Version und Installationsartefakte sollen noch stärker gepinnt werden
Backups und Restore sind noch nicht systematisch getestet
Monitoring und Alerting fehlen noch
```

Diese Punkte gehören nicht versteckt, sondern bilden direkt den Arbeitsvorrat für die nächste Ausbaustufe.

## Der Gesamtaufbau

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
                    │ PR
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
               │        │
               │        └── Kernel Grep
               └─────────── Blog
                    │
                    ▼
               cloudflared
                    │
                    ▼
        staging-blog.obivan.org
                    │
                    ▼
         öffentlicher Deployment-Gate
                    │
                    ▼
       promotion/staging-verified
                    │
                    ▼
       Promotion-PR Candidate → main
                    │
                    ▼
              manueller Merge
                    │
                    ▼
          Hetzner Production Deploy
                    │
                    ▼
              blog.obivan.org
```

Der wesentliche Gewinn ist nicht Flux als einzelnes Tool.

Der Gewinn ist, dass die Zustände nachvollziehbar voneinander getrennt sind:

```text
Code
 ↓
Container-Image
 ↓
Git-Sollzustand
 ↓
Cluster-Zustand
 ↓
öffentlicher Test
 ↓
verifizierter Promotion-Candidate
 ↓
Production-Freigabe
```

Jeder Schritt lässt sich separat prüfen und bei einem Fehler einer konkreten Schicht zuordnen.

---

## Weiter in Teil III

Teil I hat die Plattform online gebracht.

Teil II hat daraus einen reproduzierbaren GitOps- und Staging-Workflow gemacht und gleichzeitig gezeigt, an welchen Stellen noch echte technische Grenzen bestehen.

Teil III kann genau dort ansetzen:

```text
Secrets sauberer verwalten
K3s-Versionen und Downloads pinnen
Branch-Gates härten
Image-Digests statt nur Tags prüfen
Search separat im Deployment-Gate verifizieren
Backups und Restore testen
Monitoring und Alerting ergänzen
Cluster-Hardening
```

**Fortsetzung: Teil III – K3s im Homelab härten: Secrets, Backups, Updates und Observability.**

<!-- series-next: k3s-proxmox-part-3-hardening-secrets-backups-observability -->