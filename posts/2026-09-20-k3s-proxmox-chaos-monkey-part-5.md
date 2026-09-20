---
id: 2026-09-20-k3s-proxmox-chaos-monkey-part-5
version: 1
title: "K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog"
status: publish
date: 2026-09-20
created_at: 2026-09-20
updated_at: 2026-09-20
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Statt nur zu behaupten, dass Kubernetes Ausfälle abfängt, lösche ich in Staging absichtlich einen laufenden Blog-Pod. Das Ergebnis: 3 → 2 → 3 Ready Pods, 6,95 Sekunden Recovery und kein beobachteter HTTP-Fehler."
tags:
  - Kubernetes
  - K3s
  - Proxmox
  - Chaos-Engineering
  - GitOps
  - Flux
  - Observability
  - RBAC
  - Self-Hosting
  - DevOps
search_queries:
  - query: Wie teste ich Kubernetes Pod Failover mit Chaos Engineering?
    maxRank: 1
  - query: Wie baue ich einen sicheren Chaos Monkey für K3s?
    maxRank: 1
  - query: Wie messe ich Recovery Zeit und HTTP Fehler bei einem Kubernetes Pod Ausfall?
    maxRank: 1
---

Teil IV endete mit einer ziemlich einfachen Erkenntnis:

> Drei Pods sind erst dann interessant, wenn ich absichtlich einen davon kaputt mache.

Einen Pod manuell mit `kubectl delete pod` zu löschen, hatte ich bereits ausprobiert.

Diesmal wollte ich den Test reproduzierbar machen.

Nicht als Demo.

Nicht als Shell-Befehl, den ich irgendwann vergesse.

Sondern als kleines kontrolliertes Chaos-Experiment mit festen Sicherheitsgrenzen, Messwerten und einem öffentlich sichtbaren Ergebnis.

Das Ergebnis des ersten Laufs:

| Messwert | Ergebnis |
| --- | ---: |
| Blog-Pods vor dem Test | 3 / 3 Ready |
| niedrigster beobachteter Stand | 2 / 3 Ready |
| Endzustand | 3 / 3 Ready |
| Recovery-Zeit | **6.950 ms** |
| öffentliche HTTP-Checks | 10 |
| beobachtete HTTP-Fehler | **0** |
| Search vor dem Test | erreichbar |
| Search nach dem Test | erreichbar |
| Ergebnis | **PASS** |

Das ist genau der Test, den ich mit Kubernetes machen wollte:

```text
3 / 3 Ready
   ↓
ein Pod wird absichtlich gelöscht
   ↓
2 / 3 Ready
   ↓
ReplicaSet startet Ersatz
   ↓
3 / 3 Ready
```

Und währenddessen blieb der öffentliche Healthcheck in allen beobachteten Requests erreichbar.

## Warum überhaupt ein Chaos Monkey?

„Chaos Monkey“ klingt erstmal dramatischer als es in meinem Aufbau ist.

Die Idee ist simpel:

> Eine bekannte Fehlerklasse absichtlich und kontrolliert auslösen und messen, ob das System so reagiert wie erwartet.

Mein erster Versuch beschränkt sich deshalb auf genau eine Sache:

```text
einen Blog-Pod in Staging löschen
```

Nicht:

```text
Node herunterfahren
Netzwerk zerstören
Cloudflare abschalten
Proxmox rebooten
Production Pods löschen
```

Chaos Engineering ist für mich an dieser Stelle nicht „möglichst viel kaputt machen“.

Es ist eher:

```text
Hypothese
↓
kleiner definierter Fehler
↓
Messung
↓
Ergebnis
```

Meine Hypothese war:

> Wenn einer von drei Blog-Pods ausfällt, bleibt der öffentliche Blog erreichbar und Kubernetes stellt innerhalb kurzer Zeit wieder drei Ready Pods her.

## Das Experiment bekommt ein eigenes Sicherheitsmodell

Ich wollte dafür auf keinen Fall irgendeinen Pod mit Admin-Rechten ausstatten.

Der Chaos Monkey bekommt deshalb einen eigenen ServiceAccount:

```text
ServiceAccount
chaos-monkey
```

Dazu eine Role nur im Namespace `blog-staging`:

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "delete"]
```

Das ist absichtlich keine ClusterRole.

Der Pod kann also nicht einfach in andere Namespaces wechseln und dort Ressourcen löschen.

Zusätzlich gilt im Code eine harte Namespace-Prüfung:

```text
namespace muss exakt blog-staging sein
```

Production ist damit für v1 ausgeschlossen.

## RBAC kann mein Label nicht erzwingen

Ein wichtiger Punkt:

Kubernetes RBAC kann sagen:

```text
dieser ServiceAccount darf Pods löschen
```

Es kann aber nicht einfach sagen:

```text
dieser ServiceAccount darf nur Pods mit
chaos.obivan.org/enabled=true
löschen
```

Der Label-Filter ist deshalb **kein RBAC-Sicherheitsmechanismus**.

Er ist ein zusätzlicher Guard in meiner Anwendung.

Der Chaos Monkey sucht ausschließlich:

```text
app=blog
chaos.obivan.org/enabled=true
```

Und bevor ein Pod als Opfer akzeptiert wird, prüft der Runner zusätzlich:

- `app=blog`
- explizites Chaos-Opt-in
- Controller ist ein ReplicaSet
- der Pod enthält den erwarteten `blog`-Container

Das ist wichtig, weil ich die Grenze korrekt benennen will:

```text
RBAC begrenzt Namespace + Ressource + Verb
Anwendungslogik begrenzt das konkrete Ziel
```

Beides zusammen reduziert den Blast Radius deutlich.

## Production bekommt kein Chaos-Label

Das Opt-in wird nur im Staging-Overlay gesetzt:

```yaml
- op: add
  path: /spec/template/metadata/labels/chaos.obivan.org~1enabled
  value: "true"
```

Damit gilt:

```text
blog-staging      → Chaos opt-in
blog-production   → kein Chaos opt-in
```

Selbst wenn ich später den Runner versehentlich in Production starten würde, fehlt dort schon die erwartete Zielmenge.

Zusätzlich verweigert der Runner ohnehin jeden Namespace außer `blog-staging`.

## Vor dem Löschen muss alles gesund sein

Ein Chaos-Test auf einem bereits kaputten System bringt wenig.

Deshalb gibt es einen Preflight.

Vor dem Experiment müssen exakt drei geeignete Blog-Pods vorhanden und Ready sein:

```text
erwartet: 3 / 3
```

Außerdem muss der öffentliche Healthcheck funktionieren:

```text
https://staging-blog.obivan.org/healthz
```

Wenn einer dieser Punkte nicht passt:

```text
kein Pod wird gelöscht
```

Das finde ich wichtiger als den eigentlichen Delete-Befehl.

Der interessante Teil eines Chaos-Runners ist nicht:

```text
DELETE /api/v1/.../pods/<name>
```

sondern die Frage:

> Unter welchen Bedingungen darf dieser DELETE überhaupt stattfinden?

## Genau ein Opfer

Im ersten Experiment wird maximal ein Pod ausgewählt.

Aus der validierten Zielmenge wird zufällig einer bestimmt.

Dann folgt genau ein Kubernetes-DELETE.

Kein Loop.

Keine zufällige Anzahl.

Keine Eskalation.

```text
1 Experiment
=
maximal 1 gelöschter Blog-Pod
```

Auch der vorbereitete CronJob bleibt dauerhaft:

```yaml
suspend: true
```

Ich will keinen automatischen wöchentlichen Pod-Killer, nur weil ich gerade Chaos Engineering interessant finde.

Für einen echten Versuch wird bewusst ein einmaliger Job gestartet.

Nach dem Test wird dieser Job wieder aus dem GitOps-Sollzustand entfernt.

## GitOps auch für den Fehler

Das Experiment selbst lief ebenfalls über Git.

Für den ersten Test lag kurzzeitig ein einmaliger Job im Staging-Sollzustand:

```text
staging
↓
Flux
↓
Job chaos-monkey-manual-...
↓
ein kontrollierter Pod-Delete
```

Nach dem Experiment wurde das Job-Manifest wieder entfernt.

Flux pruned den abgeschlossenen Job.

Der dauerhafte Zustand enthält nur noch:

```text
ServiceAccount
Role
RoleBinding
suspendierter CronJob
Result-ConfigMap
```

Damit bleibt ein Experiment ein bewusstes Ereignis und wird nicht Teil des normalen Betriebs.

## Die Messung

Direkt nach dem Delete beginnt der Runner zu messen.

Alle ungefähr 500 ms prüft er zwei Dinge parallel:

```text
Kubernetes API
→ wie viele geeignete Blog-Pods sind Ready?

öffentlicher Healthcheck
→ antwortet staging-blog.obivan.org/healthz?
```

Zusätzlich wird Search vor und nach dem Experiment über eine echte API-Abfrage geprüft.

Gesammelt werden unter anderem:

```text
recoveryTimeMs
httpChecks
httpFailures
minimumReadyPods
maximumReadyPods
searchReachableBefore
searchReachableAfter
```

Damit wird aus:

```text
„sah eigentlich gut aus“
```

ein reproduzierbares Ergebnis.

## Der erste Lauf

Der erste echte Versuch startete am 19. September 2026 um:

```text
19:57:05 UTC
```

Abgeschlossen war er um:

```text
19:57:12.581 UTC
```

Der Runner meldete:

```text
Result: PASS
Recovery: 6950 ms
HTTP checks: 10
HTTP failures: 0
Ready pods observed: 2 → 3
Search before experiment: reachable
Search after experiment: reachable
```

Die entscheidende Zahl ist für mich nicht einmal die Recovery-Zeit.

Es sind die beiden Zeilen:

```text
Ready pods observed: 2 → 3
HTTP failures: 0
```

Der Fehler ist also tatsächlich eingetreten.

Und der öffentliche Dienst blieb in allen beobachteten Checks erreichbar.

## 0 HTTP-Fehler bedeutet nicht „0 Millisekunden Ausfall garantiert“

Hier ist mir eine Einschränkung wichtig.

Aus zehn erfolgreichen HTTP-Checks kann ich nicht mathematisch beweisen, dass es zwischen zwei Requests niemals für wenige Millisekunden einen Fehler gegeben hat.

Was ich gemessen habe, ist:

> Während des 6,95 Sekunden langen Recovery-Fensters schlugen von zehn ausgeführten öffentlichen Healthchecks null fehl.

Das ist deutlich belastbarer als „ich habe im Browser nichts gemerkt“.

Aber es ist kein lückenloser Beweis für absolut null Downtime.

Für eine feinere Messung könnte ich später:

- die Abtastrate erhöhen,
- mehrere parallele Clients verwenden,
- Request-Latenzen erfassen,
- einen externen unabhängigen Probe-Standort verwenden.

Für v1 reicht mir die aktuelle Aussage:

```text
kein beobachteter HTTP-Fehler
```

## Recovery-Zeit ist nicht dasselbe wie Downtime

Die 6,95 Sekunden bedeuten:

```text
Pod gelöscht
↓
Kubernetes erkennt Soll/Ist-Abweichung
↓
neuer Pod wird erstellt
↓
Container startet
↓
Readiness Probe wird erfolgreich
↓
wieder 3 / 3 Ready
```

Während dieser Zeit liefen aber weiterhin zwei gesunde Pods.

Deshalb gilt:

```text
Recovery-Zeit: 6,95 s
beobachtete Dienstunterbrechung: 0 HTTP-Fehler
```

Genau diese Trennung ist für mich bei Hochverfügbarkeit wichtig.

Ein System kann mehrere Sekunden brauchen, um wieder vollständig redundant zu sein, ohne dass der Benutzer in dieser Zeit einen Ausfall bemerkt.

## Öffentlicher Status statt Kubernetes-Dashboard

Für das Experiment wollte ich außerdem einen kleinen öffentlichen Statusbereich im Blog.

Nicht Grafana.

Nicht das Kubernetes Dashboard.

Und definitiv keinen direkten Browser-Zugriff auf die Kubernetes API.

Der Pfad sieht so aus:

```text
Browser
↓
/status
↓
Blog
↓
/api/kubernetes-status
↓
interner kube-status Service
↓
Kubernetes API
```

Der Status-Service besitzt einen eigenen ServiceAccount mit:

```text
Pods: get, list
```

und darf die Ergebnis-ConfigMap lesen.

Der Blog selbst bekommt **keine Kubernetes API Credentials**.

Das ist mir wichtig:

```text
öffentliche Seite
≠
öffentlicher Kubernetes-Zugriff
```

## Was öffentlich sein darf

Die öffentliche API gibt nur aggregierte Informationen aus.

Zum Beispiel:

```text
Blog      3 / 3 Ready
Search    1 / 1 Ready
K3s       reachable
```

Nach einem Experiment zusätzlich:

```text
Result
Recovery-Zeit
HTTP-Fehler
Minimum Ready
Search danach
Zeitpunkt
```

Absichtlich nicht öffentlich sind:

- Pod-Namen
- Node-Namen
- interne IP-Adressen
- ServiceAccount-Tokens
- Secrets
- detaillierte Cluster-Topologie
- Name des gelöschten Pods

Selbst wenn der interne Status-Service später versehentlich mehr Daten zurückgeben würde, sanitisiert der Blog-Proxy die Antwort noch einmal anhand einer festen Whitelist.

Das ist eine zusätzliche Grenze zwischen interner Telemetrie und öffentlicher Darstellung.

## Das Resultat bleibt erhalten

Der Chaos Monkey schreibt sein sanitisiertes Ergebnis in eine vorbereitete ConfigMap:

```text
chaos-monkey-result
```

Er darf diese eine ConfigMap ausschließlich patchen.

Kein `create`.

Kein allgemeiner Schreibzugriff auf ConfigMaps.

Der Status-Service darf sie ausschließlich lesen.

Ein kleiner GitOps-Sonderfall steckt dabei in Flux.

Wenn Flux die ConfigMap bei jedem Reconcile wieder exakt auf den Git-Wert setzen würde, wäre das Ergebnis sofort wieder weg.

Deshalb ist sie mit:

```yaml
kustomize.toolkit.fluxcd.io/ssa: IfNotPresent
```

markiert.

Flux legt sie an, überschreibt danach aber nicht permanent den Laufzeitwert.

So bleibt das letzte Experiment sichtbar.

## Der Observer ist absichtlich langweilig

Für die Auswertung existiert zusätzlich ein manueller GitHub-Actions-Workflow:

```text
Observe staging chaos experiment
```

Der bekommt keine Kubeconfig.

Er fragt nur die ohnehin öffentliche, bereits sanitisiert ausgegebene Status-API ab.

Optional kann ich für spätere Tests einen unteren Zeitstempel angeben:

```text
completed_after
```

Damit wird bei Experiment Nummer zwei nicht versehentlich das alte PASS-Ergebnis von Experiment Nummer eins angezeigt.

Auch hier ist die Trennung bewusst:

```text
GitHub Actions
↓
öffentliche Status-API

nicht:

GitHub Actions
↓
Admin-Kubeconfig
↓
Cluster
```

## Was der Test bewiesen hat

Für meinen aktuellen Aufbau kann ich jetzt konkret sagen:

1. Ein einzelner Blog-Pod darf während des Betriebs verschwinden.
2. Der ReplicaSet-Controller stellt die gewünschte Replikazahl wieder her.
3. Die Readiness fällt messbar von drei auf zwei und wieder auf drei.
4. Die vollständige Wiederherstellung der Redundanz dauerte im ersten Versuch 6,95 Sekunden.
5. Während zehn öffentlichen Healthchecks wurde kein HTTP-Fehler beobachtet.
6. Search blieb vor und nach dem Experiment erreichbar.

Das ist deutlich besser als:

```text
Kubernetes sollte das eigentlich können.
```

## Was der Test ausdrücklich nicht bewiesen hat

Der Versuch sagt nichts darüber aus, was passiert, wenn:

```text
die K3s-VM stirbt
der Proxmox-Host ausfällt
mein Internetanschluss ausfällt
cloudflared komplett verschwindet
Search während einer Anfrage neu startet
der gesamte Standort nicht erreichbar ist
```

Teil IV bleibt also weiterhin richtig:

```text
Application HA
≠
Infrastructure HA
```

Der Chaos Monkey hat nur die erste Ebene automatisiert getestet.

## Die nächsten Eskalationsstufen

Ich will den Blast Radius weiter schrittweise erhöhen.

Nicht alles auf einmal.

Die Reihenfolge, die mich interessiert:

```text
Experiment 1
ein Blog-Pod
✓ bestanden

Experiment 2
wiederholte Blog-Pod-Ausfälle

Experiment 3
Search kontrolliert neu starten

Experiment 4
cloudflared kontrolliert ausfallen lassen

Experiment 5
gesamte K3s-VM nicht erreichbar

Experiment 6
Proxmox aus

Experiment 7
automatischer Failover zu Hetzner
```

Spätestens ab Experiment 5 reicht Kubernetes allein nicht mehr.

Dann muss der zweite Standort aus Teil IV tatsächlich übernehmen.

## Zwischenstand

Die Architektur ist damit um eine kleine Test- und Beobachtungsschicht gewachsen:

```text
                    Internet
                       ↓
                  Cloudflare
                       ↓
                     K3s
                  ┌────┴────┐
                  │         │
               3x Blog    Search
                  │
                  │ opt-in
                  ▼
             Chaos Monkey
                  │
          delete max. 1 Pod
                  │
                  ▼
             Kubernetes

/status
   ↓
Blog Proxy
   ↓
kube-status
   ↓
aggregierte Readiness
   +
letztes Chaos-Ergebnis
```

Der wichtigste Unterschied ist für mich aber weniger die zusätzliche Technik.

Vorher hatte ich eine Annahme:

> Drei Pods sollten einen einzelnen Pod-Ausfall abfangen.

Jetzt habe ich eine Messung:

> Ein Pod wurde absichtlich entfernt. Readiness fiel auf 2/3, nach 6,95 Sekunden waren wieder 3/3 Ready, und in zehn öffentlichen Healthchecks trat kein Fehler auf.

Genau dafür wollte ich Chaos Engineering in diesem Homelab einsetzen.

Nicht um spektakulär Dinge zu zerstören.

Sondern um Behauptungen über Zuverlässigkeit in überprüfbare Experimente zu verwandeln.

## Die bisherigen Teile

- [[k3s-proxmox-cloudflare-part-1|Teil I: Blog-Staging mit Cloudflare Tunnel]]
- [[k3s-proxmox-flux-gitops-part-2|Teil II: GitOps mit Flux und echtem Staging]]
- [[k3s-proxmox-hardening-part-3|Teil III: Feste Versionen und verschlüsselte Secrets]]
- [[k3s-proxmox-production-part-4|Teil IV: Production ist nicht gleich Hochverfügbarkeit]]

## Als Nächstes

Ein einzelner Pod-Ausfall ist jetzt sauber getestet.

Der deutlich interessantere nächste Schritt ist der Fehler **unterhalb** von Kubernetes:

> Was passiert, wenn die gesamte K3s-VM oder der Proxmox-Host verschwindet?

Dann können mir drei Replicas innerhalb desselben Nodes nicht mehr helfen.

Genau dort muss der zweite Standort auf Hetzner aus Teil IV anfangen, echten Wert zu liefern.
