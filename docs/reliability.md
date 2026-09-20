# Reliability und Chaos Engineering

Kernel Notes behandelt Betriebsverhalten als Teil des Produkts. Neben Healthchecks und einem öffentlichen, sanitizierten Kubernetes-Status gibt es in Staging kontrollierte Chaos-Experimente.

Chaos ist dabei kein Dauerfeuer, sondern ein bewusst gestarteter Test mit klaren Guards, beobachtbarer Recovery und anschließendem Cleanup.

## Healthchecks

Der Blog stellt `/healthz` bereit. Deployment-Workflows verwenden diesen Endpunkt als technische Mindestbedingung für Staging- und Production-Gates.

Für Deployments wird zusätzlich `/build-info.json` geprüft, damit nicht nur irgendein gesunder Pod antwortet, sondern tatsächlich die erwartete Version ausgeliefert wird.

Production prüft außerdem Kernel Grep über den öffentlichen Blog-Pfad.

## Kubernetes-Status

K3s enthält einen separaten Status-Service aus `status-monitor/`.

Der Blog veröffentlicht dessen sanitizierte Sicht unter:

```text
/status
/api/kubernetes-status
```

Der Status-Service besitzt nur lesende Kubernetes-Rechte für die benötigten Informationen. In Staging umfasst das aktuell Pods, das Ergebnis des eigenen Chaos Runners sowie die für die Anzeige benötigten nativen Chaos-Mesh-Ressourcen.

Die öffentliche Antwort soll betriebliche Aussagen ermöglichen, ohne interne Topologie preiszugeben.

Nicht öffentlich ausgegeben werden unter anderem:

- Pod-Namen
- Node-Namen
- interne IP-Adressen
- Kubernetes-Credentials

## Eigener Chaos Runner

Der Runner liegt unter `chaos-monkey/` und wird als eigenes Image gebaut. Die Staging-Kustomization pinnt dieses Image genauso wie Blog, Search und Status auf einen exakten Git-Commit.

Der hinterlegte CronJob bleibt absichtlich suspendiert. Ein Experiment wird als expliziter One-shot-Job gestartet.

Für Blog-Pod-Experimente gelten unter anderem:

- Namespace muss exakt `blog-staging` sein
- Jobname muss dem manuellen Chaos-Präfix entsprechen
- nur explizit für Chaos freigegebene Workloads werden berücksichtigt
- vor dem Experiment müssen die erwarteten Blog-Replikas Ready sein
- Kandidaten müssen von einem ReplicaSet kontrolliert werden
- der öffentliche Healthcheck muss vor dem Eingriff grün sein
- Auswirkungen werden begrenzt
- anschließend wird bis zur Recovery gewartet
- RBAC bleibt auf die benötigten Ressourcen und Verben beschränkt

Damit reicht ein versehentliches Entsuspendieren des CronJobs nicht aus, um automatisch einen wirksamen Versuch auszulösen.

Die Staging-Werkzeuge erfassen unter anderem Recovery-Zeit, Ready-Minimum/-Maximum, beobachtete HTTP-Ausfälle und Search-Erreichbarkeit. Zusätzlich wurden kontrollierte Search-Restart-Experimente in denselben beobachtbaren Lifecycle integriert.

## Chaos Mesh

Für Netzwerkfehler wird Chaos Mesh separat über Flux installiert.

Die aktuelle Installation ist bewusst enger begrenzt als eine Standardinstallation:

- Helm-Chart auf Version `2.8.4` gepinnt
- Controller-Cache clusterweit sichtbar, damit die benötigten CRD-Controller sauber arbeiten
- Fault-Injection über Namespace-Filter begrenzt
- nur `blog-staging` ist explizit für Injection freigegeben
- K3s-`containerd` wird über `/run/k3s/containerd/containerd.sock` angesprochen
- Dashboard deaktiviert
- DNS-Server zunächst deaktiviert
- ein Controller-Manager für den kleinen Staging-Cluster

Wichtig ist die Trennung zwischen Beobachtung und Injection: Der Controller darf die benötigten cluster-scoped Ressourcen sehen; Fehler dürfen nur in explizit freigegebenen Namespaces injiziert werden.

Die Installation selbst erzeugt keinen Fehler.

Vor einem Netzwerkexperiment werden Control Plane und Node-Voraussetzungen geprüft, darunter die `NetworkChaos`-CRD und das Kernel-Modul `sch_netem`.

Geplante bzw. vorbereitete Fehlerklassen sind insbesondere:

- Latenz
- Packet Loss
- DNS-bezogene Fehlerbilder nach Aktivierung der dafür nötigen Komponenten

Ein konkretes Netzwerkexperiment wird als zeitlich begrenzter One-shot-GitOps-Zustand aktiviert und anschließend wieder aus dem Sollzustand entfernt.

## Beobachtung von Netzwerkexperimenten

Für Chaos-Mesh-Versuche existiert der Workflow:

```text
.github/workflows/observe-network-chaos.yml
```

Die aktive Messung übernimmt `scripts/network-chaos-probe.js`.

Damit werden Netzwerkexperimente nicht nur anhand des Kubernetes-Objekts bewertet, sondern auch über die beobachtete Wirkung und Recovery.

## Ergebnis des eigenen Chaos Runners

Das letzte sanitizierte Ergebnis des eigenen Runners wird in `chaos-monkey-result` gehalten.

Der Workflow `.github/workflows/observe-chaos-result.yml` kann ein Experiment anschließend beobachten und dessen Zustand in eine für GitHub und die öffentliche Statusseite geeignete Form bringen.

Fehlschläge werden ebenfalls sanitisiert. Interne Objektnamen oder Clusterdetails sollen nicht als Diagnoseinformation nach außen gelangen.

Bei wiederholten Versuchen ist der Zeitpunkt des Experiments relevant. Der Observer kann deshalb an ein `completed_after`-Fenster gebunden werden, damit kein älteres Ergebnis fälschlich als aktueller Versuch interpretiert wird.

## Experiment-Lifecycle

Der gewünschte Ablauf ist:

```text
stabiler Staging-Zustand
        |
        v
Preflight
        |
        v
expliziter One-shot-Zustand
        |
        v
kontrollierter Fehler
        |
        v
Wirkung + Recovery beobachten
        |
        v
sanitisiertes Ergebnis
        |
        v
Observer / Status
        |
        v
One-shot-Zustand aus GitOps entfernen
```

Das Ergebnis des eigenen Runners bleibt erhalten, damit der letzte bekannte Versuch weiterhin sichtbar ist.

## Production

Production profitiert von normalen Healthchecks, drei Blog-Replikas und dem Kubernetes-Status, führt die Staging-Chaos-Experimente aber nicht automatisch aus.

Zusätzlich bleibt die Hetzner-Installation aus `main` aktuell und kann als Standby-/Rollback-Origin dienen.

Ein automatischer HA-Failover zwischen K3s und Hetzner ist noch nicht umgesetzt und darf deshalb nicht als bestehende Reliability-Garantie dokumentiert werden.

## Prinzipien für neue Experimente

Neue Chaos-Funktionen sollten nur aufgenommen werden, wenn sie diese Eigenschaften behalten:

1. Staging-spezifisch statt Production-by-default.
2. Explizit gestartet statt dauerhaft automatisch.
3. Eng begrenzter Blast Radius.
4. Preflight vor dem Eingriff.
5. Messbare Wirkung und Recovery-Kriterien.
6. Sanitizierte öffentliche Telemetrie.
7. Minimal notwendige Kubernetes-Rechte.
8. Reproduzierbarer GitOps-Zustand und klares Cleanup.
