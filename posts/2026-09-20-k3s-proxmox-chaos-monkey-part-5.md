---
id: 2026-09-20-k3s-proxmox-chaos-monkey-part-5
version: 6
title: 'K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog'
status: publish
date: 2026-09-20T00:00:00.000Z
created_at: 2026-09-20T00:00:00.000Z
updated_at: 2026-09-20T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Kubernetes Pod Failover mit Chaos Engineering: Recovery-Zeit, HTTP-Fehler und
  ein gemessener 500-ms-NetworkChaos in meinem K3s-Staging.
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
  - query: >-
      Wie teste ich Kubernetes Pod Failover mit einem Chaos Monkey in K3s
      Staging?
    maxRank: 1
  - query: Wie begrenze ich den Blast Radius eines Chaos Monkey in K3s?
    maxRank: 1
  - query: >-
      Wie messe ich Recovery Zeit und HTTP Fehler bei einem Kubernetes Pod
      Ausfall?
    maxRank: 1
  - query: Wie teste ich 500 ms Latenz von Blog zu Search mit Chaos Mesh?
    maxRank: 1
cover_query: Kubernetes K3s Proxmox DevOps
cover_provider: pixabay
cover_provider_id: '4745050'
cover_image: /assets/covers/2026-09-20-k3s-proxmox-chaos-monkey-part-5.jpg
cover_alt: 'train, mist, k3, mongolia, railway, train, train, train, train, train'
cover_focus: center
cover_credit: by jeremy888 via Pixabay
cover_credit_url: 'https://pixabay.com/photos/train-mist-k3-mongolia-railway-4745050/'
cover_source_url: 'https://pixabay.com/photos/train-mist-k3-mongolia-railway-4745050/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
---

Teil IV endete mit einer einfachen Frage:

> Drei Pods sind schön – aber was passiert, wenn ich absichtlich einen davon kaputt mache?

Genau das teste ich hier. Nicht als theoretische Einführung in Chaos Engineering, sondern als Praxisprotokoll für meinen eigenen K3s-Cluster.

Die allgemeine Methodik – Steady State, Hypothese, Blast Radius, PASS/FAIL und Fehlerklassen – steht separat in:

- [[chaos-engineering-chaos-monkey-kubernetes|Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen]]

Teil V bleibt bewusst konkret.

Kurz gesagt: Ich teste **Kubernetes Pod Failover mit Chaos Engineering**, indem ich gezielt einen opt-in Blog-Pod entferne und gleichzeitig **Recovery-Zeit und öffentliche HTTP-Fehler** messe. Danach erweitere ich denselben Ansatz auf NetworkChaos zwischen Blog und Search.

## Der Sicherheitsrahmen

Mein erster Chaos Runner darf genau eines:

```text
im Namespace blog-staging
einen passenden Blog-Pod finden
und gezielt löschen
```

Dafür bekommt er einen eigenen ServiceAccount mit einer namespacelokalen Role:

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "delete"]
```

Kein ClusterRole-Zugriff. Zusätzlich prüft der Runner selbst:

- Namespace muss exakt `blog-staging` sein.
- Ziel braucht `app=blog`.
- Ziel braucht `chaos.obivan.org/enabled=true`.
- Controller muss ein ReplicaSet sein.
- Der erwartete Blog-Container muss vorhanden sein.

Wichtig: Das Label ist **kein RBAC-Sicherheitsmechanismus**. RBAC begrenzt Namespace, Ressource und Verb; die Zielauswahl begrenzt zusätzlich die Anwendungslogik.

Production bekommt das Chaos-Label gar nicht erst.

Vor jedem Versuch läuft ein Preflight:

```text
3 / 3 Blog-Pods Ready?
Healthcheck gesund?
Search erreichbar?
richtige Zielmenge?
```

Wenn etwas davon nicht passt, startet kein Experiment.

Auch GitOps bleibt Teil des Sicherheitsmodells: aktive Chaos-Jobs oder NetworkChaos-Manifeste liegen nur für den Versuch im Staging-Sollzustand und werden danach wieder entfernt.

## Kubernetes Pod Failover mit Chaos Engineering

Die Hypothese:

> Wenn einer von drei Blog-Pods ausfällt, bleibt der öffentliche Blog erreichbar und Kubernetes stellt innerhalb kurzer Zeit wieder drei Ready-Pods her.

### Recovery-Zeit und HTTP-Fehler beim Pod-Ausfall

Der erste echte Lauf am 19. September 2026 ergab:

| Messwert | Ergebnis |
| --- | ---: |
| Blog-Pods vorher | 3 / 3 Ready |
| niedrigster Stand | 2 / 3 Ready |
| Endzustand | 3 / 3 Ready |
| Recovery | **6,950 s** |
| öffentliche Healthchecks | 10 |
| HTTP-Fehler | **0** |
| Search vorher/nachher | erreichbar |
| Ergebnis | **PASS** |

Der interessante Teil ist nicht nur, dass Kubernetes einen Ersatz-Pod startet. Entscheidend ist die Kombination:

```text
interne Recovery
+
öffentlicher Dienst bleibt erreichbar
```

## Experiment #2: drei Failover-Zyklen

Ein einzelner erfolgreicher Pod-Delete sagt wenig über Stabilität aus. Deshalb folgte derselbe Test dreimal hintereinander – aber nie mit zwei absichtlichen Ausfällen gleichzeitig.

Vor jeder Iteration muss der Cluster wieder vollständig auf 3 / 3 Ready stehen.

| Iteration | Recovery |
| --- | ---: |
| 1 | 6,815 s |
| 2 | 6,932 s |
| 3 | 6,938 s |
| Durchschnitt | **6,895 s** |
| Spannweite | **123 ms** |

Zusätzlich:

```text
32 öffentliche Healthchecks
0 beobachtete HTTP-Fehler
Search vorher/nachher erreichbar
```

Über Experiment #1 und #2 zusammen:

```text
4 absichtliche Pod-Ausfälle
42 öffentliche Healthchecks
0 beobachtete HTTP-Fehler
```

Das ist kein mathematischer Beweis für absolut null Downtime. Es ist aber ein reproduzierbarer Messpunkt statt eines manuellen `kubectl delete pod`.

## Von Pod-Chaos zu NetworkChaos

Pod-Deletes testen nur eine Fehlerklasse. Als Nächstes wollte ich eine funktionierende, aber schlechte Verbindung testen:

```text
Blog bleibt gesund
↓
Blog → Search wird absichtlich langsamer
↓
Verbindung muss sich danach vollständig normalisieren
```

Dafür läuft Chaos Mesh in Staging über Flux.

Der Fault-Injection-Scope bleibt opt-in:

```text
controllerManager.enableFilterNamespace = true
blog-staging:
  chaos-mesh.org/inject = enabled
```

Auf K3s nutzt der Daemon den vorhandenen containerd-Socket:

```text
/run/k3s/containerd/containerd.sock
```

Für NetworkChaos ist außerdem `sch_netem` auf dem K3s-Node geladen.

### Der erste Installationsfehler

Mein erster Helm-Stand war zu restriktiv:

```yaml
clusterScoped: false
controllerManager:
  enableFilterNamespace: true
  targetNamespace: blog-staging
```

Der `chaos-controller-manager` landete damit im `CrashLoopBackOff`. Die Logs zeigten Cache-Sync-Timeouts unter anderem für `PhysicalMachineChaos` und `RemoteCluster`.

Der stabile Stand trennt Beobachtung und Injection sauber:

```yaml
clusterScoped: true

controllerManager:
  enableFilterNamespace: true
```

Damit darf der Controller die benötigten clusterweiten CRDs beobachten. Fault Injection bleibt trotzdem auf explizit freigegebene Namespaces begrenzt.

Nach der Änderung liefen Controller und Daemon stabil mit 0 Restarts.

## Experiment #8a: 500 ms Delay Blog → Search

Der erste NetworkChaos war bewusst klein:

```yaml
kind: NetworkChaos
spec:
  action: delay
  direction: to
  duration: "30s"

  selector:
    labelSelectors:
      app: blog

  target:
    selector:
      labelSelectors:
        app: search

  delay:
    latency: "500ms"
    jitter: "0ms"
```

Keine externen Ziele, kein Packet Loss im selben Lauf.

Der erste technische Versuch:

```text
erstellt:  15:07:57 UTC
Recovery: 15:08:27 UTC
```

| Messwert | Ergebnis |
| --- | ---: |
| Traffic | Blog → Search |
| konfigurierter Delay | 500 ms |
| Dauer | 30 s |
| Ziel selektiert | ja |
| vollständig recovered | ja |
| fehlgeschlagene Chaos-Mesh-Events | 0 |
| technisches Ergebnis | **PASS** |

Dabei fiel noch ein Fehler in meiner Beobachtung auf: Der alte GitHub-Observer wartete ausschließlich auf die ConfigMap `chaos-monkey-result` meines eigenen Pod-Runners. Ein nativer Chaos-Mesh-`NetworkChaos` schreibt dort aber nichts hinein.

Deshalb gibt es jetzt zwei Pfade:

```text
Pod-Delete
→ eigener Runner
→ chaos-monkey-result

NetworkChaos
→ Chaos-Mesh-Status
→ eigener NetworkChaos-Observer
```

Der Status-Service hat dafür nur read-only `get/list` auf `NetworkChaos`.

## Zweiter NetworkChaos-Lauf: diesmal gemessen

Der technische PASS beantwortete noch nicht die wichtigere Frage:

> Was sehen echte Requests während des Faults?

Deshalb wartet der Observer im zweiten Lauf auf `AllInjected=true` und misst dann 20 Sekunden lang parallel:

```text
/healthz
/api/search?q=Kubernetes&limit=3
```

Nach `AllRecovered=true` folgt eine kurze Post-Recovery-Baseline.

Der zweite Lauf startete um 17:39:22 UTC. Die Recovery wurde exakt 30 Sekunden später beobachtet.

### Während des Faults

| Probe | Checks | Fehler | avg | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Blog Health | 56 | **0** | 172 ms | 148 ms | 267 ms | 969 ms | 969 ms |
| Search API | 56 | **0** | 253 ms | 215 ms | 534 ms | 684 ms | 684 ms |

### Post-Recovery-Baseline

| Messwert | Search |
| --- | ---: |
| Fehler | **0** |
| avg | 212 ms |
| p50 | 203 ms |
| p95 | 281 ms |
| p99 | 284 ms |

Das Delta:

| Messwert | Delta |
| --- | ---: |
| avg | **+41 ms** |
| p50 | **+12 ms** |
| p95 | **+253 ms** |
| p99 | **+400 ms** |

Die konfigurierten 500 ms tauchen nicht einfach als „Baseline + exakt 500 ms“ auf jeder HTTP-Anfrage auf. `delay.latency` wirkt auf Netzwerkpakete im ausgewählten Traffic; End-to-End-HTTP-Latenz hängt zusätzlich vom konkreten Request- und Verbindungsverlauf ab.

Die Wirkung ist trotzdem klar in der Tail-Latency sichtbar:

```text
p95: 281 → 534 ms
p99: 284 → 684 ms
```

Gleichzeitig:

```text
0 / 56 Search-Fehler
0 / 56 Health-Fehler
0 fehlgeschlagene Chaos-Mesh-Events
vollständige Recovery nach 30 s
```

Die achtsekündige Baseline ist dabei nur ein kurzer Vergleichspunkt, kein langfristiger Performance-Benchmark.

## Was diese Tests belegen – und was nicht

Belegt ist:

- Kubernetes stellte vier absichtlich gelöschte Blog-Pods zuverlässig wieder her.
- Die Pod-Recovery lag in allen Läufen ungefähr bei 6,8 bis 7,0 Sekunden.
- In 42 Pod-Chaos-Healthchecks trat kein beobachteter HTTP-Fehler auf.
- Der 30-Sekunden-NetworkChaos wurde vollständig zurückgenommen.
- Im gemessenen NetworkChaos beantworteten Blog und Search jeweils 56 öffentliche Requests ohne Fehler.
- Search zeigte gleichzeitig deutlich erhöhte Tail-Latency.

Nicht belegt ist:

- echte Hochverfügbarkeit bei Ausfall der K3s-VM oder des Proxmox-Hosts,
- Standort-Failover,
- Verhalten bei Packet Loss,
- Verhalten bei Search-Restart, CPU-/Memory-Druck oder DNS-Störungen.

## Als Nächstes

Die nächsten sinnvollen Stufen sind:

```text
Search unter echten Restart-Bedingungen
↓
langsamer Search-Start / Readiness
↓
CPU / Memory
↓
DNS
↓
Packet Loss
↓
Rollout
↓
Node
↓
VM / Tunnel
↓
Standort
```

Der allgemeine Hintergrund und die komplette Matrix stehen im Grundlagenartikel:

- [[chaos-engineering-chaos-monkey-kubernetes|Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen]]

## Die bisherigen Teile

- [[k3s-proxmox-cloudflare-part-1|Teil I: Blog-Staging mit Cloudflare Tunnel]]
- [[k3s-proxmox-flux-gitops-part-2|Teil II: GitOps mit Flux und echtem Staging]]
- [[k3s-proxmox-hardening-part-3|Teil III: Feste Versionen und verschlüsselte Secrets]]
- [[k3s-proxmox-production-part-4|Teil IV: Production ist nicht gleich Hochverfügbarkeit]]

## Quellen

- [Principles of Chaos Engineering](/sources.html#principles-chaos-engineering)
- [Chaos Engineering in Kubernetes: Why It Matters and How Teams Actually Use It](/sources.html#chaos-engineering-kubernetes-medium)
- [Kubernetes: Liveness, Readiness, and Startup Probes](/sources.html#kubernetes-probes)
- [Kubernetes: Disruptions und PodDisruptionBudgets](/sources.html#kubernetes-disruptions)
- [Kubernetes: Debugging DNS Resolution](/sources.html#kubernetes-dns-debugging)
- [Chaos Mesh Dokumentation](/sources.html#chaos-mesh-docs)
