---
id: 2026-09-16-k3s-proxmox-flux-gitops-part-2
version: 2
title: "K3s auf Proxmox – Teil II: GitOps mit Flux und echtem Staging"
status: publish
date: 2026-09-16
created_at: 2026-09-16
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Nach dem ersten K3s-Deployment kommt der spannendere Teil: GitOps mit Flux, immutable SHA-Images, ein eigener staging-Branch, öffentlicher Smoke-Test und ein automatischer Promotion-PR nach main."
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
---

In Teil I war das Ziel noch relativ simpel: eine Debian-VM auf Proxmox, K3s installieren, Blog und Search deployen, `cloudflared` davor setzen und am Ende über `staging-blog.obivan.org` ein ehrliches `ok` zurückbekommen.

Das hat funktioniert.

Aber genau an diesem Punkt beginnt eigentlich erst der interessante Teil.

Denn ein Cluster, den ich nur mit manuellen `kubectl apply`-Kommandos aktuell halte, ist zwar Kubernetes, aber noch lange kein sauberer Deployment-Prozess.

Ich wollte deshalb weg von diesem Ablauf:

```text
Änderung im Repository
        ↓
GitHub Actions baut Image
        ↓
ich kopiere SHA
        ↓
kubectl set image
        ↓
kubectl rollout status
```

und hin zu diesem:

```text
Feature / Obsidian
        ↓
Pull Request
        ↓
staging
        ↓
GitHub Actions
        ↓
GHCR
        ↓
Git als gewünschter Zustand
        ↓
Flux
        ↓
K3s
        ↓
staging-blog.obivan.org
        ↓
öffentlicher Smoke-Test
        ↓
automatischer PR staging -> main
        ↓
manueller Production-Merge
```

Das ist der Stand, den ich in Teil II aufgebaut habe.

## Warum überhaupt GitOps?

Der größte Unterschied ist für mich nicht, dass jetzt ein weiteres Tool im Cluster läuft.

Der eigentliche Unterschied ist die Richtung der Verantwortung.

Vorher habe ich dem Cluster gesagt, was er tun soll:

```text
Admin
  ↓
kubectl
  ↓
Cluster
```

Mit Flux läuft es anders:

```text
Git
  ↓
Flux beobachtet den gewünschten Zustand
  ↓
Cluster gleicht sich selbst daran an
```

Der Cluster wird damit nicht mehr aktiv von GitHub Actions oder meinem Laptop gesteuert.

Das war für mein Homelab besonders wichtig, weil der K3s-Node bewusst in einem internen Netz hängt.

GitHub Actions kann und soll `172.22.2.x` überhaupt nicht erreichen.

Stattdessen zieht Flux selbst aus Git.

```text
GitHub
   ▲
   │ HTTPS / SSH outbound
   │
Flux im Cluster
```

Kein eingehender Zugriff auf den Kubernetes-API-Server notwendig.

## Ein eigener staging-Branch

Bis dahin hatte mein Blog im Wesentlichen nur `main` als relevante Veröffentlichungsgrenze.

Das passt für Production, aber nicht für echtes Staging.

Deshalb gibt es jetzt einen eigenen Branch:

```text
feature/*
   ↓ PR
staging
   ↓
Staging Deployment
   ↓ PR
main
   ↓
Production
```

Wichtig ist dabei: `staging` ist nicht einfach nur ein Sammelbranch.

Er ist die GitOps-Quelle für den K3s-Cluster.

Flux beobachtet genau diesen Branch und genau diesen Pfad:

```text
branch: staging
path:   infra/kubernetes/staging
```

`main` bleibt dagegen weiter die Produktionsgrenze für den Hetzner-Deploy.

Damit sind die beiden Umgebungen sauber voneinander getrennt:

```text
staging
   └── Proxmox / K3s

main
   └── Hetzner / Docker Compose
```

## Die Staging-Pipeline baut immutable Images

Ein Punkt war mir wichtig: Ich wollte nicht, dass Kubernetes einfach immer wieder `:latest` oder nur `:staging` zieht.

Für Debugging und Rollbacks muss eindeutig nachvollziehbar sein, welcher Commit gerade läuft.

Deshalb baut die Pipeline beide Images mit dem Git-Commit als Tag.

Vereinfacht:

```yaml
BLOG_IMAGE=ghcr.io/0b-ivan/kernel-notes-blog:${GITHUB_SHA}
SEARCH_IMAGE=ghcr.io/0b-ivan/kernel-notes-search:${GITHUB_SHA}
```

Zusätzlich gibt es weiterhin einen komfortablen `staging`-Tag.

Der relevante Teil ist aber der SHA-Tag.

Beispiel:

```text
ghcr.io/0b-ivan/kernel-notes-blog:e5c68c850887c175bc4438cd8a2a5091d2e37a0b
```

Damit ist klar:

```text
Commit e5c68c...
        =
Image e5c68c...
        =
Deployment e5c68c...
```

Das ist deutlich angenehmer als später herausfinden zu müssen, welches Image irgendwann einmal hinter `latest` lag.

## Kustomize hält den gewünschten Image-Stand fest

Die Kubernetes-Manifeste liegen bereits im Repository.

Der eigentliche Deployment-Stand steckt bei mir in:

```text
infra/kubernetes/staging/kustomization.yaml
```

Dort werden die Images überschrieben:

```yaml
images:
  - name: ghcr.io/0b-ivan/kernel-notes-blog
    newTag: <commit-sha>
  - name: ghcr.io/0b-ivan/kernel-notes-search
    newTag: <commit-sha>
```

Nach erfolgreichem Build ersetzt GitHub Actions dort die Tags mit dem gerade gebauten Commit.

Damit steht der gewünschte Zustand wieder in Git.

Das ist wichtig, weil Flux nicht auf Zuruf irgendein Image deployt.

Flux liest Git.

## Warum die Pipeline zurück nach staging schreibt

Der Ablauf sieht dadurch zunächst etwas ungewöhnlich aus:

```text
Merge nach staging
        ↓
GitHub Actions baut Images
        ↓
Kustomize-Tags werden aktualisiert
        ↓
GitHub Actions committet den neuen Soll-Zustand zurück nach staging
        ↓
Flux erkennt Änderung
        ↓
K3s rollt aus
```

Der Commit sieht zum Beispiel so aus:

```text
chore(staging): deploy <sha> [skip ci]
```

Das `[skip ci]` ist hier wichtig.

Ohne diese Bremse würde der GitOps-Commit die Pipeline erneut starten, die wieder einen Commit erzeugt, der wieder die Pipeline startet.

Ein sehr kleines Detail, das sonst sehr schnell sehr viele Builds produziert.

## Direkte Pushes sollen nicht einfach deployen

Weil `staging` jetzt eine echte Veröffentlichungsgrenze ist, wollte ich nicht, dass jeder beliebige Push automatisch deployed wird.

Der Workflow prüft deshalb, ob der Commit mit einem gemergten Pull Request nach `staging` verknüpft ist.

Vereinfacht:

```bash
gh api \
  "/repos/${REPOSITORY}/commits/${COMMIT_SHA}/pulls"
```

Danach wird geprüft, ob mindestens ein PR existiert mit:

```text
merged_at != null
base.ref == staging
```

Wenn nicht:

```text
Refusing staging deployment
```

Das ersetzt keine saubere Branch Protection, ist aber eine zusätzliche technische Schranke direkt im Deployment-Workflow.

## Flux installieren

Flux selbst läuft direkt im K3s-Cluster.

Auf meinem temporären Admin-Host habe ich die Flux CLI 2.9.5 installiert und den Download per Checksumme verifiziert. Danach habe ich zuerst Version und Voraussetzungen geprüft:

```bash
flux --version
flux check --pre
```

Bei meinem Cluster kam dabei unter anderem:

```text
Kubernetes 1.36.4+k3s1 >=1.33.0-0
prerequisites checks passed
```

Dann der eigentliche Bootstrap:

```bash
flux bootstrap github \
  --owner=0b-ivan \
  --repository=Blog \
  --branch=staging \
  --path=infra/kubernetes/staging \
  --personal \
  --token-auth=false
```

Der entscheidende Teil ist für mich:

```text
--branch=staging
--path=infra/kubernetes/staging
```

Damit weiß Flux genau, was seine Quelle ist.

## Deploy Key statt PAT im Cluster

Mit

```text
--token-auth=false
```

verwendet Flux für die Git-Verbindung einen SSH-Deploy-Key.

Ich wollte bewusst vermeiden, einfach einen breit berechtigten persönlichen GitHub-Token dauerhaft in Kubernetes abzulegen.

Der Cluster braucht nur das, was er tatsächlich tun muss: Repository lesen.

Das ist für diesen Aufbau deutlich passender.

## Der Moment, in dem GitOps wirklich funktioniert

Nach dem Bootstrap sah der Zustand so aus:

```bash
flux get sources git -A
flux get kustomizations -A
```

Erwartet:

```text
flux-system   Ready=True
```

Bei meinem ersten Lauf zeigte Flux bereits eine Revision vom `staging`-Branch und meldete:

```text
Applied revision: staging@sha1:...
```

Damit war der wichtige Punkt erreicht:

Der Cluster hatte seinen gewünschten Zustand aus Git gelesen und angewendet.

Nicht mein lokales `kubectl` hatte entschieden, was laufen soll.

Git hatte es entschieden.

## Der erste automatische Rollout

Danach kam der erste echte Test.

Ein Commit landet in `staging`.

GitHub Actions baut neue Images und schreibt die SHA-Tags in Kustomize.

Flux erkennt den neuen Git-Stand und Kubernetes startet neue Pods.

Auf dem Cluster konnte ich anschließend sehen:

```text
blog-...     1/1 Running
search-...   1/1 Running
```

Und die Deployments zeigten exakt dieselben SHA-Tags, die vorher in GHCR gebaut worden waren.

Das war für mich der eigentliche Beweis, dass die Kette geschlossen war.

## Ein Test-Blogpost als End-to-End-Probe

Nur auf grüne Controller zu schauen reicht mir bei so einem Setup nicht.

Deshalb habe ich absichtlich einen kleinen Test-Blogpost angelegt.

Nicht weil der Inhalt wichtig war, sondern weil damit wirklich alle Schichten beteiligt waren:

```text
Markdown
  ↓
Git
  ↓
GitHub Actions
  ↓
Docker Build
  ↓
GHCR
  ↓
Kustomize
  ↓
Flux
  ↓
K3s
  ↓
Blog
  ↓
Cloudflare Tunnel
  ↓
Browser
```

Erst als der Testartikel auf `staging-blog.obivan.org` sichtbar war, war für mich klar: Das ist nicht nur theoretisch GitOps.

Die komplette Anwendungskette funktioniert.

Anschließend wurde der Testpost natürlich wieder entfernt.

## Staging muss sichtbar Staging sein

Eine weitere Kleinigkeit ist im Alltag erstaunlich wichtig.

Wenn Staging optisch genauso aussieht wie Production, ist ein falscher Tab schnell teuer.

Deshalb bekommt nur die Staging-Instanz einen eigenen Startpunkt:

```text
staging-server.js
```

Production startet weiterhin normal mit:

```text
seo-server.js
```

Der Staging-Server injiziert zusätzlich:

```html
data-environment="staging"
```

und eine eigene CSS-Datei:

```text
/assets/css/staging.css
```

Dazu kommt ein deutlich sichtbarer `STAGING`-Banner und ein orange-schwarzer Rahmen um den Viewport.

Der Rahmen war übrigens ein kleiner Browser-Stolperstein: `border-image` mit einem wiederholten Gradient sah auf WebKit nicht zuverlässig aus.

Die robuste Variante waren am Ende vier feste Gradient-Flächen für oben, unten, links und rechts.

Nicht besonders elegant, aber deutlich zuverlässiger.

## Nicht nur healthz prüfen

Ein `200 OK` sagt nur, dass irgendeine Version der Anwendung antwortet.

Das reicht für einen echten Deployment-Gate nicht.

Deshalb bekommt das Blog-Image beim Build eine eindeutige Staging-Version:

```text
<blog-version>-staging.<github-run-number>
```

Diese landet in:

```text
/build-info.json
```

Der Workflow wartet nach dem GitOps-Commit so lange, bis von außen wirklich genau diese Version zurückkommt.

Sinngemäß:

```bash
curl https://staging-blog.obivan.org/healthz
curl https://staging-blog.obivan.org/build-info.json
```

Geprüft wird:

```text
healthz == ok
version == erwartete Build-Version
HTML enthält data-environment="staging"
```

Damit weiß die Pipeline nicht nur, dass die Seite erreichbar ist.

Sie weiß, dass **der gerade gebaute Stand** über Cloudflare tatsächlich online ist.

Das ist ein wichtiger Unterschied.

## Erst danach darf Production vorbereitet werden

An diesem Punkt wollte ich den nächsten manuellen Schritt ebenfalls reduzieren.

Wenn Staging erfolgreich gebaut, von Flux ausgerollt und öffentlich geprüft wurde, gibt es technisch keinen Grund, jedes Mal von Hand einen neuen Pull Request nach `main` anzulegen.

Deshalb macht das jetzt die Pipeline.

Sie prüft zuerst, ob bereits ein Promotion-PR existiert:

```text
head: staging
base: main
```

Wenn schon einer offen ist, passiert nichts weiter.

Der bestehende PR enthält automatisch auch die neuen Staging-Commits.

Wenn keiner existiert, wird automatisch einer angelegt:

```text
promote: staging to production
```

Der wichtige Punkt:

**Der PR wird nur geöffnet. Er wird nicht automatisch gemerged.**

Production bleibt damit weiterhin eine bewusste Entscheidung.

```text
Staging automatisch
Production manuell freigeben
```

Genau diese Grenze wollte ich haben.

## Obsidian gehört jetzt ebenfalls in diesen Flow

Mein Blog wird nicht nur direkt in Git bearbeitet.

Ich schreibe Artikel auch in Obsidian und synchronisiere sie über Self-hosted LiveSync mit CouchDB.

Der bisherige Publisher erzeugte bei `status: publish` direkt einen Pull Request nach `main`.

Das wäre mit dem neuen Staging-Modell falsch gewesen.

Deshalb zeigt der Publisher jetzt auf:

```text
PUBLISHER_BASE_BRANCH=staging
```

Damit wird aus:

```text
Obsidian
  ↓
PR nach main
```

jetzt:

```text
Obsidian
  ↓
Publisher
  ↓
PR nach staging
  ↓
CI
  ↓
Merge
  ↓
Staging Deployment
  ↓
öffentlicher Smoke-Test
  ↓
automatischer Promotion-PR nach main
```

Der Content-Workflow folgt damit endlich derselben Deployment-Logik wie normale Codeänderungen.

Das gefällt mir besonders gut, weil Obsidian dadurch kein Sonderweg mehr ist.

## Was mit status: publish passiert

Ein Artikel bleibt zunächst lokal beziehungsweise im LiveSync-Vault.

Erst wenn im Frontmatter steht:

```yaml
status: publish
```

wird der Publisher aktiv.

Nach dem Debounce-Fenster entsteht ein deterministischer Branch:

```text
obsidian/<artikel-slug>
```

und ein PR gegen `staging`.

Weitere Änderungen am Artikel aktualisieren denselben PR.

Es entstehen also nicht fünf verschiedene Publish-PRs für denselben Text.

Nach dem Merge übernimmt die normale Staging-Pipeline.

Das ist genau die Trennung, die ich wollte:

```text
Obsidian entscheidet: bereit zur Veröffentlichung
GitHub entscheidet: geprüft und gemerged
Staging entscheidet: technisch lauffähig
Mensch entscheidet: Production
```

## Was ich heute nicht mehr manuell tun muss

Nach diesem Umbau sind einige Dinge aus meinem normalen Ablauf verschwunden:

```text
kein kubectl set image
kein manuelles SHA-Kopieren
kein kubectl rollout restart
kein manueller Flux-Reconcile
kein manueller Production-PR
kein direkter Obsidian-Publish nach main
```

Was übrig bleibt, ist im Wesentlichen:

```text
PR prüfen
Merge nach staging
Staging ansehen
Promotion-PR prüfen
Merge nach main
```

Das ist ein deutlich angenehmerer Workflow.

## Was ich trotzdem bewusst nicht automatisiert habe

Ich hätte auch den letzten Merge nach `main` automatisieren können.

Das will ich aber derzeit nicht.

Mein Production-System läuft weiterhin auf Hetzner mit Docker Compose und ist die öffentlich relevante Instanz.

Deshalb bleibt zwischen getestetem Staging und Production eine bewusste Freigabe.

Automatisierung ist für mich nicht das Ziel an sich.

Sie soll langweilige und fehleranfällige Schritte entfernen, nicht jede Entscheidung abschaffen.

## Der aktuelle Gesamtaufbau

Damit sieht die Architektur jetzt ungefähr so aus:

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
             öffentlicher Smoke-Test
                    │
                    ▼
       automatischer PR staging -> main
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

Für ein kleines Homelab-Projekt ist das inzwischen ziemlich viel Infrastruktur.

Der entscheidende Punkt ist aber: Jede Komponente hat inzwischen einen klaren Zweck.

K3s führt aus.

Flux reconciliert.

Git beschreibt den Soll-Zustand.

GitHub Actions baut Images und aktualisiert diesen Soll-Zustand.

Cloudflare macht den Dienst von außen erreichbar.

Obsidian bleibt meine Schreiboberfläche.

Und `main` bleibt die bewusste Produktionsgrenze.

## Was ich aus dem Umbau mitnehme

Der größte Lerneffekt war für mich nicht ein bestimmter Flux-Befehl.

Es war die Trennung der Zuständigkeiten.

Vorher war Deployment im Kern ein Skript, das aktiv irgendwo etwas verändert hat.

Jetzt gibt es eine Kette aus klaren Zuständen:

```text
Code
  ↓
Image
  ↓
Git-Sollzustand
  ↓
Cluster-Zustand
  ↓
öffentlicher Test
  ↓
Production-Freigabe
```

Jeder Schritt kann überprüft werden.

Und vor allem kann ich später noch nachvollziehen, **warum** eine bestimmte Version auf dem Cluster gelandet ist.

Das ist für mich der eigentliche Gewinn von GitOps.

---

## Weiter in Teil III

Teil I hat die Plattform online gebracht.

Teil II hat daraus einen echten GitOps- und Staging-Workflow gemacht.

Als Nächstes wird es weniger sichtbar, aber mindestens genauso wichtig:

```text
Secrets sauberer verwalten
K3s-Versionen pinnen
Backups und Restore testen
Monitoring und Alerting ergänzen
Cluster-Hardening
und irgendwann die Frage:
Brauche ich wirklich mehr als einen Node?
```

**Fortsetzung: Teil III – K3s im Homelab härten: Secrets, Backups, Updates und Observability.**

<!-- series-next: k3s-proxmox-part-3-hardening-secrets-backups-observability -->
