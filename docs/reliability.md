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

Der Status-Service erhält nur die für seine Aufgabe notwendigen Kubernetes-Leserechte. Die öffentliche Antwort soll betriebliche Aussagen ermöglichen, ohne interne Topologie preiszugeben.

Nicht öffentlich ausgegeben werden unter anderem:

- Pod-Namen
- Node-Namen
- interne IP-Adressen
- Kubernetes-Credentials

## Chaos-Umgebung

Chaos-Experimente gehören in `blog-staging`, nicht in Production.

Der Runner liegt unter `chaos-monkey/` und wird als eigenes Image gebaut. Die Staging-Kustomization pinnt dieses Image genauso wie Blog, Search und Status auf einen exakten Git-Commit.

Der hinterlegte CronJob bleibt absichtlich suspendiert. Ein Experiment wird als expliziter One-shot-Job gestartet.

## Grundlegende Guards

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

## Experimente

Die Staging-Werkzeuge unterstützen kontrollierte Fehlerbilder rund um den Blog und den Search-Service.

Dazu gehören insbesondere:

- begrenztes Löschen bzw. Wiederholen von Blog-Pod-Ausfällen
- Beobachtung von Ready-Minimum und Ready-Maximum
- Messung der Recovery-Zeit
- Erfassung beobachteter HTTP-Ausfälle
- Prüfung der Search-Erreichbarkeit
- kontrollierte Search-Restart-Experimente

Die konkreten Experimente werden über die jeweils eingecheckten Manifeste und den aktuellen Runner definiert. Diese Dokumentation soll deshalb die Sicherheits- und Beobachtungsprinzipien beschreiben, nicht eine unveränderliche Liste aller Versuchstypen.

## Ergebnis und Beobachtung

Das letzte sanitizierte Ergebnis wird in `chaos-monkey-result` gehalten.

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
manueller One-shot-Job
        |
        v
kontrollierter Fehler
        |
        v
Recovery beobachten
        |
        v
sanitisiertes Ergebnis
        |
        v
Observer / Status
        |
        v
One-shot-Job aus GitOps entfernen
```

Das Ergebnis-ConfigMap bleibt erhalten, damit der letzte bekannte Versuch weiterhin sichtbar ist.

## Production

Production profitiert von denselben normalen Healthchecks, drei Blog-Replikas und dem Kubernetes-Status, führt die Staging-Chaos-Experimente aber nicht automatisch aus.

Zusätzlich bleibt die Hetzner-Installation aus `main` aktuell und kann als Standby-/Rollback-Origin dienen.

Ein automatischer HA-Failover zwischen K3s und Hetzner ist noch nicht umgesetzt und darf deshalb nicht als bestehende Reliability-Garantie dokumentiert werden.

## Prinzipien für neue Experimente

Neue Chaos-Funktionen sollten nur aufgenommen werden, wenn sie diese Eigenschaften behalten:

1. Staging-spezifisch statt Production-by-default.
2. Explizit gestartet statt dauerhaft automatisch.
3. Eng begrenzter Blast Radius.
4. Preflight vor dem Eingriff.
5. Messbare Recovery-Kriterien.
6. Sanitizierte öffentliche Telemetrie.
7. Minimal notwendige Kubernetes-Rechte.
8. Reproduzierbarer GitOps-Zustand und klares Cleanup.
