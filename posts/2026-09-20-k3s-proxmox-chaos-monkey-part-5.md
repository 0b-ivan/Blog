---
id: 2026-09-20-k3s-proxmox-chaos-monkey-part-5
version: 3
title: "K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog"
status: publish
date: 2026-09-20
created_at: 2026-09-20
updated_at: 2026-09-20
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Erst ein Pod, dann drei Failover-Zyklen hintereinander: Mein K3s-Staging blieb in 42 öffentlichen Healthchecks ohne beobachteten HTTP-Fehler und stellte die Redundanz jeweils in rund 6,9 Sekunden wieder her."
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
  - query: Wie begrenze ich den Blast Radius eines Chaos Monkey in K3s?
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

Hier geht es bewusst um die konkrete Praxisfrage:

> Wie teste ich Kubernetes Pod Failover mit Chaos Engineering in meinem K3s-Staging – und wie begrenze ich dabei den Blast Radius meines eigenen Chaos Monkey?

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

Die allgemeinen Grundlagen dahinter – Steady State, Hypothese, Blast Radius, Stop Conditions und weitere Fehlerklassen – habe ich inzwischen in einem eigenen Beitrag zusammengefasst:

- [[chaos-engineering-chaos-monkey-kubernetes|Chaos Monkey ist kein Zufall: Chaos Engineering in Kubernetes richtig testen]]

Teil V bleibt dagegen bewusst das praktische Logbuch meiner eigenen Experimente.

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

## Experiment #2: drei Failover-Zyklen hintereinander

Ein einzelner erfolgreicher Lauf ist gut.

Er sagt aber noch wenig darüber aus, ob die Recovery-Zeit stabil bleibt.

Für Experiment #2 habe ich den Runner deshalb erweitert:

```text
3 / 3 Ready
↓
1 Pod löschen
↓
vollständig auf 3 / 3 warten
↓
2 Sekunden Settle-Zeit
↓
nächsten Pod löschen
↓
wieder vollständig recovern
↓
insgesamt 3 Iterationen
```

Wichtig war mir dabei:

> Nie zwei absichtliche Pod-Ausfälle gleichzeitig.

Vor **jeder** Iteration prüft der Runner erneut, ob exakt drei geeignete Blog-Pods vorhanden und Ready sind.

Erst dann darf der nächste Delete stattfinden.

Der zweite Versuch lief am 20. September 2026 von:

```text
01:53:04.096 UTC
```

bis:

```text
01:53:31.828 UTC
```

Das sanitisiert veröffentlichte Ergebnis:

```text
Result: PASS
Experiment: repeated-blog-pod-delete
Iterations: 3 / 3
Recovery times: 6815, 6932, 6938 ms
Max recovery: 6938 ms
Total recovery: 20685 ms
HTTP checks: 32
HTTP failures: 0
Ready pods observed: 2 → 3
Search before experiment: reachable
Search after experiment: reachable
```

Die drei Recovery-Zeiten lagen damit bei:

| Iteration | Recovery |
| --- | ---: |
| 1 | 6,815 s |
| 2 | 6,932 s |
| 3 | 6,938 s |
| Durchschnitt | **6,895 s** |
| Spannweite | **123 ms** |

Das ist für mich fast interessanter als ein einzelner besonders schneller Lauf.

Die Wiederherstellung war über drei absichtliche Ausfälle hinweg sehr ähnlich.

## Experiment #1 und #2 im Vergleich

| Messwert | Experiment #1 | Experiment #2 |
| --- | ---: | ---: |
| absichtliche Pod-Ausfälle | 1 | 3 |
| Recovery-Zeit | 6,950 s | 6,815 / 6,932 / 6,938 s |
| durchschnittliche Recovery | 6,950 s | **6,895 s** |
| maximale Recovery | 6,950 s | **6,938 s** |
| öffentliche HTTP-Checks | 10 | 32 |
| beobachtete HTTP-Fehler | **0** | **0** |
| niedrigster Ready-Stand | 2 / 3 | 2 / 3 |
| Search vorher/nachher | erreichbar | erreichbar |
| Ergebnis | **PASS** | **PASS** |

Über beide Experimente zusammen sind das:

```text
4 absichtliche Pod-Ausfälle
42 öffentliche Healthchecks
0 beobachtete HTTP-Fehler
```

Das beweist weiterhin keine mathematisch lückenlose Null-Downtime.

Es ist aber ein deutlich stärkerer Messpunkt als ein einzelner erfolgreicher Pod-Delete.

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

Der Browser spricht dabei ausschließlich mit meinem Blog-Endpoint; die Kubernetes API bleibt clusterintern.

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

Die Trennung bleibt damit klar:

```text
Browser
→ Blog-API
→ sanitisiertes Aggregat

Kubernetes API
→ nur intern
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

Für die Auswertung existiert zusätzlich ein GitHub-Actions-Workflow:

```text
Observe staging chaos experiment
```

Der bekommt keine Kubeconfig.

Er fragt nur die ohnehin öffentliche, bereits sanitisiert ausgegebene Status-API ab.

Bei einem One-shot-Experiment startet der Observer automatisch. Manuell lässt er sich weiterhin per `workflow_dispatch` ausführen.

Damit ein alter PASS nicht versehentlich als neues Experiment gilt, bestimmt der Workflow den ursprünglichen Commit-Zeitpunkt des aktiven Experiment-Manifests und akzeptiert nur Ergebnisse danach.

Dabei bin ich direkt in einen schönen Zeitstempel-Fehler gelaufen.

Der erste Filter verglich beispielsweise:

```text
2026-09-20T03:52:48+02:00
```

mit:

```text
2026-09-20T01:53:31.828Z
```

als einfachen String.

Beide Zeitpunkte benutzen aber unterschiedliche UTC-Offsets.

Die Lösung:

```text
ISO-8601
↓
Unix Epoch
↓
numerischer Vergleich
```

Seitdem wird nicht mehr die Schreibweise des Zeitpunkts verglichen, sondern der tatsächliche Zeitpunkt.

Der Observer schreibt sein Ergebnis in die GitHub-Job-Summary und zusätzlich in einen Commit-Status `chaos-observer`. Dieser Status verlinkt direkt auf den zugehörigen Actions-Run.

Auch hier ist die Trennung bewusst:

```text
GitHub Actions
↓
öffentliche Status-API
↓
sanitisiertes Ergebnis

nicht:

GitHub Actions
↓
privilegierte Kubeconfig
↓
Cluster
```

## Was die Tests bewiesen haben

Für meinen aktuellen Aufbau kann ich jetzt konkret sagen:

1. Ein einzelner Blog-Pod darf während des Betriebs verschwinden.
2. Auch drei nacheinander ausgelöste Pod-Ausfälle wurden vollständig abgefangen.
3. Der ReplicaSet-Controller stellt die gewünschte Replikazahl wieder her.
4. Die Readiness fiel im Experiment bis auf zwei Ready-Pods und anschließend wieder auf drei.
5. Die drei Recovery-Zeiten von Experiment #2 lagen nur 123 ms auseinander.
6. Über beide Experimente wurden 42 öffentliche Healthchecks ausgeführt und kein HTTP-Fehler beobachtet.
7. Search blieb vor und nach beiden Experimenten erreichbar.

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

Die ersten Pod-Tests waren nur die unterste Ebene.

Nach dem Blick auf typische Kubernetes-Chaos-Szenarien will ich die Fehlerklassen jetzt systematischer eskalieren:

~~~text
Experiment 1
ein Blog-Pod
✓ bestanden

Experiment 2
wiederholte Blog-Pod-Ausfälle
✓ bestanden

Experiment 3
Search unter echten Anfragen neu starten
↻ in Arbeit

Experiment 4
langsamer Search-Start / Readiness-Verhalten

Experiment 5
CPU-Stress auf Search

Experiment 6
Memory Pressure / kontrollierter OOM

Experiment 7
DNS-Störung

Experiment 8
Netzwerklatenz / Packet Loss

Experiment 9
fehlerhafter oder stockender Rollout

Experiment 10
Node Drain / Eviction / PDB-Verhalten

Experiment 11
cloudflared oder komplette K3s-VM nicht erreichbar

Experiment 12
Proxmox beziehungsweise gesamter Standort weg
→ Failover zu Hetzner
~~~

Damit teste ich nicht mehr nur:

~~~text
Kann Kubernetes einen Pod ersetzen?
~~~

Sondern schrittweise:

~~~text
Kann die Anwendung degradieren?
Sind Probes korrekt?
Bleiben Abhängigkeiten beherrschbar?
Sind Netzwerk und DNS robust?
Überlebt die Plattform einen Node-Verlust?
Funktioniert der Standort-Failover?
~~~

Wichtig ist dabei auch die Art des Fehlers.

Ein direkter Pod-Delete testet zum Beispiel nicht automatisch ein PodDisruptionBudget. PDBs greifen bei freiwilligen Evictions wie einem Node Drain; ein direkter Delete kann daran vorbeigehen.

Für die allgemeinere Testmatrix und die Unterschiede zwischen Pod-, Dependency-, Ressourcen-, Netzwerk- und Node-Chaos verweise ich auf:

- [[chaos-engineering-chaos-monkey-kubernetes|Chaos Monkey ist kein Zufall: Chaos Engineering in Kubernetes richtig testen]]

Spätestens bei Node-, VM- und Standort-Ausfällen reicht Kubernetes innerhalb meiner einzelnen K3s-VM allein nicht mehr.

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
      delete max. 1 Pod / Iteration
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

Jetzt habe ich mehrere Messpunkte:

> Vier Pod-Ausfälle wurden absichtlich ausgelöst. Im wiederholten Experiment lagen die drei Recovery-Zeiten bei 6,815, 6,932 und 6,938 Sekunden. Über beide Experimente trat in 42 öffentlichen Healthchecks kein beobachteter Fehler auf.

Genau dafür wollte ich Chaos Engineering in diesem Homelab einsetzen.

Nicht um spektakulär Dinge zu zerstören.

Sondern um Behauptungen über Zuverlässigkeit in überprüfbare Experimente zu verwandeln.

## Die bisherigen Teile

- [[k3s-proxmox-cloudflare-part-1|Teil I: Blog-Staging mit Cloudflare Tunnel]]
- [[k3s-proxmox-flux-gitops-part-2|Teil II: GitOps mit Flux und echtem Staging]]
- [[k3s-proxmox-hardening-part-3|Teil III: Feste Versionen und verschlüsselte Secrets]]
- [[k3s-proxmox-production-part-4|Teil IV: Production ist nicht gleich Hochverfügbarkeit]]

## Als Nächstes

Der Blog selbst hat einen einzelnen und mehrere aufeinanderfolgende Pod-Ausfälle bestanden.

Der nächste Schritt bleibt Search unter realen Anfragen.

Danach will ich aber nicht einfach immer neue Pods löschen, sondern die Fehlerklasse wechseln:

~~~text
Search / Dependency
↓
Startup + Readiness
↓
CPU / Memory
↓
DNS / Netzwerk
↓
Rollout
↓
Node
↓
VM / Tunnel
↓
Standort
~~~

Die allgemeine Methodik und die vollständige Testmatrix stehen in:

- [[chaos-engineering-chaos-monkey-kubernetes|Chaos Monkey ist kein Zufall: Chaos Engineering in Kubernetes richtig testen]]

Teil V bleibt das Praxisprotokoll dazu.

## Quellen

- [Principles of Chaos Engineering](/sources.html#principles-chaos-engineering)
- [Chaos Engineering in Kubernetes: Why It Matters and How Teams Actually Use It](/sources.html#chaos-engineering-kubernetes-medium)
- [Kubernetes: Liveness, Readiness, and Startup Probes](/sources.html#kubernetes-probes)
- [Kubernetes: Disruptions und PodDisruptionBudgets](/sources.html#kubernetes-disruptions)
- [Kubernetes: Debugging DNS Resolution](/sources.html#kubernetes-dns-debugging)
