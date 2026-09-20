---
id: 2026-09-20-chaos-engineering-chaos-monkey-kubernetes
version: 2
title: "Chaos Monkey ist kein Zufall: Chaos Engineering systematisch testen"
status: publish
date: 2026-09-20
created_at: 2026-09-20
updated_at: 2026-09-20
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Chaos Engineering ist kontrolliertes Testen von Resilience: Steady State, Hypothese, Blast Radius, Stop Conditions und messbare PASS-Kriterien statt zufälligem Kaputtmachen."
tags:
  - Chaos-Engineering
  - Kubernetes
  - SRE
  - Resilience
  - Observability
  - DevOps
  - Testing
  - Reliability
search_queries:
  - query: Was ist Chaos Engineering und wie funktioniert ein Chaos Monkey?
    maxRank: 1
  - query: Welche Chaos Tests sollte ich in Kubernetes durchführen?
    maxRank: 1
  - query: Wie plane ich sichere Chaos Experimente mit Steady State und Stop Conditions?
    maxRank: 1
---

Ein Chaos Monkey klingt zunächst nach einem schlechten Betriebsmodell:

> Irgendetwas läuft stabil – also löschen wir zufällig einen Server.

Genau das ist **nicht** die Idee.

Chaos Engineering fragt nicht:

```text
Was kann ich kaputt machen?
```

sondern:

```text
Welche Annahme über mein System möchte ich überprüfen?
```

Erst danach kommt der Fehler.

Die konkrete Umsetzung in meinem eigenen K3s-Staging – Pod-Deletes, Recovery-Messungen und NetworkChaos – steht in:

- [[k3s-proxmox-chaos-monkey-part-5|K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog]]

Dieser Beitrag bleibt bewusst auf der allgemeinen Methodik.

## Chaos Monkey ist nur eine Fehlerklasse

Der Name Chaos Monkey stammt aus dem Netflix-Umfeld. Die ursprüngliche Idee ist simpel:

```text
laufende Instanz
↓
gezielt beenden
↓
prüfen, ob das System damit umgehen kann
```

Chaos Engineering ist breiter.

Ein Kubernetes-System kann trotz gesunder Pods Probleme haben durch:

- langsame Dependencies,
- DNS-Fehler,
- Packet Loss,
- CPU- oder Memory-Druck,
- fehlerhafte Readiness,
- kaputte Rollouts,
- Node-Ausfälle,
- oder den kompletten Verlust eines Standorts.

Kubernetes kann Pods neu starten und Traffic anhand von Probes steuern. Es weiß aber nicht automatisch, ob Benutzer gerade Timeouts, Retry-Stürme oder hohe Tail-Latency sehen.

Deshalb reicht die Aussage `Kubernetes ist grün` nicht als Resilience-Nachweis.

## Ein gutes Experiment in sechs Schritten

| Schritt | Frage |
| --- | --- |
| **Steady State** | Wie sieht gesundes Verhalten messbar aus? |
| **Hypothese** | Was erwarte ich trotz des Fehlers? |
| **Blast Radius** | Wie weit darf der Fehler wirken? |
| **Preflight** | Ist das System vor dem Test wirklich gesund? |
| **PASS/FAIL** | Welche Messwerte entscheiden das Ergebnis? |
| **Stop Conditions** | Wann breche ich sofort ab? |

Beispiel:

```text
Steady State:
3 / 3 Pods Ready
HTTP-Fehlerrate = 0 %
Search erreichbar

Hypothese:
ein Pod fällt aus
→ Blog bleibt erreichbar
→ innerhalb von 10 s wieder 3 / 3 Ready

Blast Radius:
nur Staging
nur ein opt-in Workload
nur ein Pod gleichzeitig
```

Ein gutes PASS-Kriterium verbindet interne Recovery mit externer Wirkung. „Pod kam wieder“ reicht nicht.

Ebenso wichtig sind Stop Conditions:

```text
Baseline bereits degradiert
→ ABORT

falscher Namespace
→ ABORT

mehr Targets als erwartet
→ ABORT

zweite unabhängige Komponente fällt aus
→ STOP
```

## Welche Fehlerklassen sind interessant?

| Ebene | Beispiel | Was ich messen würde |
| --- | --- | --- |
| Pod / Container | Pod löschen | Recovery, HTTP-Fehler, Ready Replicas |
| Dependency | Search nicht erreichbar | Degradation, Timeouts, Retries |
| Startup / Probes | langsamer Start | Traffic vor Ready, Restart-Schleifen |
| CPU / Memory | CPU 100 %, OOM | p95/p99, Fehler, Restarts |
| DNS | Auflösung verzögern/fehlschlagen | Timeout- und Retry-Verhalten |
| Netzwerk | Latenz, Packet Loss | Fehlerquote, Tail-Latency |
| Rollout | fehlerhafte Version | Verfügbarkeit während Deployment |
| Node | Drain / Eviction | Replicas, PDB-Verhalten |
| VM / Standort | K3s-VM oder Host weg | Failover- und Umschaltzeit |

Ein direkter Pod-Delete testet dabei **nicht** automatisch PodDisruptionBudgets. Für PDB-Verhalten sind freiwillige Evictions wie ein Node Drain aussagekräftiger.

## Meine Testmatrix

| Stufe | Experiment | Hauptfrage |
| ---: | --- | --- |
| 1 | einzelner Blog-Pod weg | bleibt der Blog erreichbar? |
| 2 | drei Pod-Ausfälle | bleibt Recovery stabil? |
| 3 | Search unter Anfragen neu starten | degradiert die App sauber? |
| 4 | langsamer Search-Start | schützen Startup/Readiness? |
| 5 | CPU-Stress | steigt Latenz kontrolliert? |
| 6 | Memory Pressure / OOM | startet Search sauber neu? |
| 7 | DNS-Störung | funktionieren Timeouts und Retries? |
| 8 | Latenz / Packet Loss | entsteht eine Kaskade? |
| 9 | fehlerhafter Rollout | bleiben gesunde Pods verfügbar? |
| 10 | Node Drain | greifen Replicas und PDBs? |
| 11 | K3s-VM weg | übernimmt externer Failover? |
| 12 | Proxmox / Standort weg | bleibt der Blog extern erreichbar? |

Die gemessenen Ergebnisse dokumentiere ich in Teil V.

## Welches Tool passt?

| Werkzeug | Sinnvoll wenn |
| --- | --- |
| **eigener Runner** | ein enger, nachvollziehbarer Fehler mit minimalen Rechten reicht |
| **Chaos Monkey** | Instanz-/Container-Ausfälle im Mittelpunkt stehen |
| **LitmusChaos** | Experimente als wiederverwendbare Workflows gebraucht werden |
| **Chaos Mesh** | Netzwerk, DNS, Stress, IO oder andere Kubernetes-native Faults getestet werden sollen |

Mein kleiner Runner ist für Pod-Deletes absichtlich simpel. Für NetworkChaos nutze ich Chaos Mesh, weil Latenz oder Packet Loss nicht sinnvoll in immer mehr Speziallogik meines eigenen Tools gehören.

## Staging zuerst, Production später

Meine Reihenfolge bleibt:

```text
lokal / Tests
↓
Staging
↓
wiederholbar machen
↓
Blast Radius verstehen
↓
Observability verifizieren
↓
erst dann Production erwägen
```

Ein unkontrollierter Staging-Test wird in Production nicht plötzlich besser.

## Chaos Engineering wird zum Regressionstest

Ein Experiment wird besonders wertvoll, wenn es nach Änderungen erneut läuft.

```text
heute:
Recovery = 6,9 s

nach neuem Init-Code:
Recovery = 14 s
```

Beides kann technisch „PASS“ sein – und trotzdem ist die zweite Version schlechter.

Langfristig interessieren deshalb nicht nur Einzelwerte, sondern Recovery-Verteilungen, Fehlerraten, p95/p99-Latenzen und Regressionen zwischen Releases.

## Mein wichtigster Lernpunkt

Kubernetes startet Pods neu. Das ist nicht die überraschende Erkenntnis.

Interessanter ist:

> Resilience wird erst belastbar, wenn ich sie als Hypothese formuliere, absichtlich störe und von außen messe.

Die konkrete Umsetzung, inklusive RBAC, Opt-in-Labels, Observer, Pod-Recovery und gemessenem NetworkChaos, steht hier:

- [[k3s-proxmox-chaos-monkey-part-5|K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog]]

## Querverweise

- [[k3s-proxmox-production-part-4|K3s auf Proxmox – Teil IV: Production ist nicht gleich Hochverfügbarkeit]]
- [[k3s-proxmox-chaos-monkey-part-5|K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog]]

## Quellen

- [Chaos Engineering in Kubernetes: Why It Matters and How Teams Actually Use It](/sources.html#chaos-engineering-kubernetes-medium)
- [Principles of Chaos Engineering](/sources.html#principles-chaos-engineering)
- [Netflix Chaos Monkey](/sources.html#netflix-chaos-monkey)
- [Kubernetes: Liveness, Readiness, and Startup Probes](/sources.html#kubernetes-probes)
- [Kubernetes: Disruptions und PodDisruptionBudgets](/sources.html#kubernetes-disruptions)
- [Kubernetes: Debugging DNS Resolution](/sources.html#kubernetes-dns-debugging)
- [LitmusChaos Dokumentation](/sources.html#litmus-chaos-docs)
- [Chaos Mesh Dokumentation](/sources.html#chaos-mesh-docs)
