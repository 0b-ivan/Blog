---
id: 2026-09-20-chaos-engineering-chaos-monkey-kubernetes
version: 1
title: "Chaos Monkey ist kein Zufall: Chaos Engineering in Kubernetes richtig testen"
status: publish
date: 2026-09-20
created_at: 2026-09-20
updated_at: 2026-09-20
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Chaos Engineering ist mehr als Pods zu löschen: Steady State, Hypothese, Blast Radius und messbare PASS-Kriterien machen aus absichtlichen Fehlern reproduzierbare Resilience-Tests."
tags:
  - Chaos-Engineering
  - Kubernetes
  - SRE
  - Resilience
  - Observability
  - DevOps
  - K3s
  - Testing
  - Reliability
search_queries:
  - query: Was ist Chaos Engineering und wie funktioniert ein Chaos Monkey?
    maxRank: 1
  - query: Welche Chaos Tests sollte ich in Kubernetes durchführen?
    maxRank: 1
  - query: Wie plane ich sichere Chaos Experimente mit Steady State und Blast Radius?
    maxRank: 1
---

Ein Chaos Monkey klingt erstmal nach einem ziemlich schlechten Betriebsmodell:

> Irgendetwas läuft stabil – also löschen wir zufällig einen Server.

Genau das ist **nicht** die Idee.

Ein sinnvoll eingesetzter Chaos Monkey ist kein digitaler Berserker, sondern ein Werkzeug innerhalb von **Chaos Engineering**.

Der Unterschied ist wichtig.

Chaos Engineering fragt nicht:

~~~text
Was kann ich kaputt machen?
~~~

Sondern:

~~~text
Welche Annahme über mein System möchte ich überprüfen?
~~~

Erst danach kommt der Fehler.

Und idealerweise ist bereits vorher klar:

- wie der gesunde Zustand aussieht,
- welcher Fehler absichtlich erzeugt wird,
- wie groß der Blast Radius sein darf,
- welche Messwerte zählen,
- wann der Versuch sofort abgebrochen wird,
- und welches Ergebnis als PASS oder FAIL gilt.

Ich bin über das Thema tiefer gestolpert, nachdem ich für meinen eigenen Blog einen kleinen Chaos Runner gebaut habe.

Dort habe ich zuerst einen einzelnen Blog-Pod gelöscht, später drei Failover-Zyklen hintereinander gemessen.

Die praktische Umsetzung steht in:

- [[k3s-proxmox-chaos-monkey-part-5|K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog]]

Dieser Artikel hier ist die allgemeinere Ebene dahinter.

## Chaos Monkey und Chaos Engineering sind nicht dasselbe

Der Name **Chaos Monkey** stammt ursprünglich aus dem Netflix-Umfeld.

Das Grundprinzip des Werkzeugs ist bewusst einfach:

~~~text
laufende Instanz
↓
gezielt beenden
↓
prüfen, ob das System damit umgehen kann
~~~

Das ist aber nur **eine Fehlerklasse**.

Chaos Engineering ist viel breiter.

Ein Kubernetes-System kann beispielsweise Probleme bekommen durch:

~~~text
Pod-Ausfall
Node-Ausfall
CPU-Sättigung
Memory Pressure
DNS-Probleme
Netzwerklatenz
Packet Loss
kaputte Readiness
fehlerhafte Rollouts
Downstream-Ausfälle
Storage-Probleme
kompletten Standortverlust
~~~

Ein Pod zu löschen testet davon genau einen Ausschnitt.

Das ist ein guter Start.

Es ist aber kein Nachweis dafür, dass das System insgesamt resilient ist.

## Kubernetes ist selbstheilend – aber nicht allwissend

Kubernetes kann sehr viel automatisch reparieren.

Wenn ein Pod eines Deployments verschwindet, erzeugt der Controller einen neuen.

Wenn eine Readiness Probe fehlschlägt, kann der Pod aus dem Service-Traffic genommen werden.

Wenn eine Liveness Probe dauerhaft fehlschlägt, kann der Container neu gestartet werden.

Das heißt aber nicht:

~~~text
Kubernetes vorhanden
=
Anwendung hochverfügbar
~~~

Kubernetes weiß zum Beispiel nicht automatisch:

- ob ein HTTP-Request trotz grünem Pod langsam geworden ist,
- ob ein Retry-Sturm einen Downstream überlastet,
- ob DNS sporadisch fehlschlägt,
- ob ein Rollout zwar „Ready“ ist, aber fachlich kaputte Antworten liefert,
- ob ein einzelner Node die gesamte Plattform trägt,
- oder ob alle Replicas am Ende auf demselben physischen Host liegen.

Genau an diesen Stellen wird Chaos Engineering interessant.

## Der wichtigste Begriff: Steady State

Bevor ich einen Fehler erzeuge, brauche ich einen messbaren Normalzustand.

Die Principles of Chaos Engineering nennen das **Steady State**.

Das ist nicht zwingend:

~~~text
alle internen Komponenten sind grün
~~~

Viel wichtiger ist der von außen beobachtbare Systemzustand.

Für einen Webdienst könnte das beispielsweise sein:

~~~text
HTTP-Fehlerrate = 0 %
p95-Latenz < 300 ms
3 / 3 Pods Ready
Search liefert Ergebnisse
~~~

Für ein anderes System kann der Steady State ganz anders aussehen.

Zum Beispiel:

~~~text
Queue wächst nicht dauerhaft
Jobs werden innerhalb von 60 s verarbeitet
Datenbank-Lag bleibt unter 5 s
~~~

Ohne diesen Ausgangspunkt lässt sich später nicht sauber beantworten, ob das Experiment tatsächlich etwas verändert hat.

## Dann kommt die Hypothese

Ein gutes Chaos-Experiment beginnt mit einer Aussage, die widerlegt werden kann.

Zum Beispiel:

> Wenn ein Blog-Pod ausfällt, bleibt der öffentliche Dienst erreichbar und Kubernetes stellt innerhalb von zehn Sekunden wieder drei Ready-Pods her.

Oder:

> Wenn Search neu startet, bleibt der Blog selbst erreichbar, Search liefert während des Neustarts kontrollierte Fehler und ist anschließend wieder funktionsfähig.

Oder:

> Wenn ein Node drainiert wird, bleiben mindestens zwei Frontend-Replicas verfügbar.

Das ist deutlich besser als:

~~~text
Wir löschen mal einen Pod und schauen, was passiert.
~~~

Denn die Hypothese definiert automatisch, was gemessen werden muss.

## Ein Experiment braucht ein PASS-Kriterium

Ein häufiger Fehler bei Chaos-Tests ist, nur den technischen Recovery-Vorgang zu beobachten.

Dann sieht das Ergebnis ungefähr so aus:

~~~text
Pod war weg
Pod kam wieder
alles gut
~~~

Das reicht mir nicht.

Ein brauchbares PASS-Kriterium verbindet **interne Recovery** mit **extern beobachtetem Verhalten**.

Beispiel:

| Messwert | PASS |
| --- | --- |
| Ready Replicas | wieder 3 / 3 |
| Recovery-Zeit | < 10 s |
| öffentliche HTTP-Fehler | 0 |
| Search vor/nach Test | erreichbar |
| ungeplante zusätzliche Restarts | 0 |

Bei einem bewusst nicht hochverfügbaren Dienst kann PASS sogar einen beobachteten Fehler voraussetzen.

Wenn Search nur eine Replica hat, wäre ein Experiment ohne irgendeinen Search-Fehler möglicherweise verdächtig.

Dann könnte die Hypothese lauten:

~~~text
Search fällt messbar aus
Blog bleibt erreichbar
Search erholt sich vollständig
~~~

Chaos Engineering bedeutet also nicht automatisch:

~~~text
kein Fehler darf sichtbar sein
~~~

Es bedeutet:

~~~text
das beobachtete Verhalten entspricht unserer vorher formulierten Erwartung
~~~

## Blast Radius ist Teil des Experiments

Der **Blast Radius** beschreibt, wie weit ein absichtlich erzeugter Fehler wirken kann.

Bei meinen ersten Tests sieht das zum Beispiel so aus:

~~~text
Namespace:
nur blog-staging

Target:
nur opt-in Workload

Iteration:
maximal ein Pod gleichzeitig

Production:
nicht erlaubt
~~~

Das ist kein nebensächliches Sicherheitsdetail.

Es ist ein zentraler Teil des Experimentdesigns.

Ein gutes Chaos-Experiment sollte eine klare Antwort auf diese Frage haben:

> Was ist das Schlimmste, das dieser Test absichtlich kaputt machen darf?

Wenn die Antwort lautet:

~~~text
weiß ich nicht genau
~~~

ist das Experiment noch nicht bereit.

## Preflight vor dem eigentlichen Fehler

Bevor ich einen kontrollierten Fehler injiziere, muss der Steady State vorhanden sein.

Sonst teste ich zwei Fehler gleichzeitig:

~~~text
System bereits degradiert
+
absichtlicher Fehler
~~~

Das Ergebnis wäre schwer interpretierbar.

Ein sinnvoller Preflight kann deshalb prüfen:

~~~text
erwartete Replicas Ready?
Healthcheck gesund?
wichtige Dependency erreichbar?
kein anderer Chaos-Test aktiv?
Ziel eindeutig?
~~~

Bei meinem eigenen Runner gilt zusätzlich:

~~~text
falscher Namespace
→ kein Experiment

falscher Pod-Typ
→ kein Experiment

fehlendes Opt-in
→ kein Experiment
~~~

Inzwischen lasse ich den Preflight sogar kurz auf einen stabilen Zustand warten, statt bei einer transienten Rollout-Sekunde sofort abzubrechen.

Auch das gehört für mich zur Reproduzierbarkeit.

## Welche Fehlerklassen sollte man überhaupt testen?

Ein hilfreicher Ausgangspunkt ist die Einteilung in mehrere Ebenen.

### Pod- und Container-Ebene

Das ist der klassische Chaos-Monkey-Bereich.

Beispiele:

~~~text
Pod löschen
Container beenden
Pod während Last neu starten
~~~

Damit lassen sich unter anderem testen:

- Replica-Verhalten,
- Service-Routing,
- Readiness,
- Recovery-Zeit,
- fehlende Redundanz.

Mein Blog-Test aus Teil V gehört genau hier hinein.

### Dependency- und Application-Ebene

Hier bleibt die Plattform selbst intakt, aber eine abhängige Funktion fällt aus.

Beispiele:

~~~text
Search nicht erreichbar
Downstream liefert HTTP 500
API antwortet extrem langsam
eine Version im Rollout ist fachlich kaputt
~~~

Das testet Fragen wie:

~~~text
degradiert die Anwendung sauber?
entstehen Retry-Stürme?
funktionieren Timeouts?
bleibt der Rest der Anwendung nutzbar?
~~~

Gerade Microservices können technisch „gesund“ aussehen und trotzdem gegenseitig eine Kaskade erzeugen.

### Probe- und Startup-Ebene

Readiness, Liveness und Startup Probes beeinflussen direkt, wann Kubernetes Traffic zu einem Pod sendet oder ihn neu startet.

Deshalb sollte ich nicht nur prüfen, **ob** eine Probe existiert.

Interessanter ist:

~~~text
Was passiert, wenn der Start deutlich länger dauert?
Was passiert bei temporärer Überlast?
Wird ein noch nicht fertiger Pod zu früh in den Traffic genommen?
Erzeugt eine aggressive Liveness Probe eine Restart-Schleife?
~~~

Eine falsch konfigurierte Liveness Probe kann unter hoher Last sogar zusätzlichen Schaden verursachen.

Chaos-Tests sind eine gute Möglichkeit, genau das sichtbar zu machen.

### CPU- und Memory-Pressure

Ein Pod kann laufen und trotzdem kaum noch sinnvoll reagieren.

Beispiele:

~~~text
CPU auf 100 %
Memory Limit erreichen
OOMKill provozieren
Speicher langsam ansteigen lassen
~~~

Interessante Messwerte:

~~~text
p95 / p99 Latenz
HTTP-Fehler
Restart Count
OOMKilled
Recovery-Zeit
Auswirkung auf andere Pods
~~~

Gerade in kleinen Clustern ist zusätzlich wichtig:

~~~text
Container-Limit
≠
verfügbarer RAM des Nodes
~~~

Ein einzelner belasteter Workload kann also auch den Node selbst unter Druck setzen.

### DNS

DNS ist eine besonders unangenehme Fehlerklasse.

Ein Dienst kann vollkommen gesund sein und trotzdem scheinbar „nicht erreichbar“, weil Namensauflösung fehlschlägt.

Mögliche Experimente:

~~~text
DNS-Antwort verzögern
Auflösung fehlschlagen lassen
CoreDNS kurz nicht erreichbar
~~~

Dann interessiert mich:

~~~text
werden Timeouts eingehalten?
funktioniert Caching?
sind Fehlermeldungen diagnostizierbar?
entsteht ein Retry-Sturm?
~~~

Ich hatte beim eigenen Pod-Failover bereits einen Vorgeschmack darauf:

Ein scheinbarer HTTP-Ausfall war in Wirklichkeit ein lokaler DNS-Timeout.

### Netzwerk

Netzwerkfehler müssen nicht binär sein.

Der unangenehmere Fall ist oft:

~~~text
Verbindung funktioniert
aber schlecht
~~~

Zum Beispiel:

~~~text
+500 ms Latenz
5 % Packet Loss
Bandbreite begrenzt
eine Richtung blockiert
Service A erreicht B nicht
~~~

Das zeigt Fehler, die ein einfacher Pod-Delete nie sichtbar machen würde.

Besonders interessant sind:

- Timeout-Ketten,
- Retry-Verhalten,
- Connection Pools,
- Circuit Breaker,
- Latenz-Explosionen.

### Rollout und Deployment

Auch ein Deployment selbst kann die Fehlerquelle sein.

Beispiele:

~~~text
neue Version startet langsam
eine Replica liefert falsche Antworten
Rollout bleibt bei 50 % hängen
alte und neue Version verhalten sich unterschiedlich
~~~

Dabei sollte ich nicht nur fragen:

~~~text
ist das Deployment irgendwann grün?
~~~

Sondern:

~~~text
was sehen Benutzer währenddessen?
~~~

### Node-Ebene

Ein Pod-Ausfall und ein Node-Ausfall sind zwei völlig verschiedene Dinge.

Ein Node-Experiment kann zum Beispiel sein:

~~~text
kubectl drain
~~~

Dabei ist eine wichtige Kubernetes-Eigenschaft zu beachten:

**PodDisruptionBudgets wirken auf freiwillige Evictions, nicht auf jeden beliebigen direkten Pod-Delete.**

Ein Chaos-Test mit:

~~~text
kubectl delete pod
~~~

prüft deshalb nicht automatisch, ob ein PDB korrekt schützt.

Für PDB-Verhalten ist ein Drain- beziehungsweise Eviction-Szenario aussagekräftiger.

### VM, Hypervisor und kompletter Standort

Irgendwann verlässt der Fehler Kubernetes vollständig.

Dann geht es um:

~~~text
K3s-VM weg
Proxmox-Host weg
Internetzugang weg
Cloudflare-Tunnel weg
gesamter Standort weg
~~~

An diesem Punkt hilft ein ReplicaSet nur noch, wenn die Replicas tatsächlich auf unabhängiger Infrastruktur laufen.

Drei Pods auf einer einzigen VM sind:

~~~text
Pod-Redundanz
~~~

aber noch keine:

~~~text
Standort-Redundanz
~~~

Genau deshalb betreibe ich meinen Blog parallel noch auf Hetzner.

## Meine Chaos-Testmatrix

Aus diesen Fehlerklassen ergibt sich für meinen eigenen Aufbau inzwischen eine deutlich größere Roadmap:

| Stufe | Experiment | Hypothese | Wichtigster Messwert |
| ---: | --- | --- | --- |
| 1 | einzelner Blog-Pod weg | Blog bleibt erreichbar | HTTP-Fehler |
| 2 | drei Pod-Ausfälle nacheinander | Recovery bleibt stabil | Recovery-Verteilung |
| 3 | Search unter Anfragen neu starten | Blog bleibt gesund, Search erholt sich | Search-Ausfallzeit |
| 4 | langsamer Search-Start | Startup/Readiness schützen Traffic | Fehler vor Ready |
| 5 | CPU-Stress auf Search | Blog bleibt isoliert | Latenz + Fehler |
| 6 | Memory Pressure / OOM | Search startet kontrolliert neu | OOM + Recovery |
| 7 | DNS-Störung | Fehler bleiben begrenzt | Timeout-/Retry-Verhalten |
| 8 | Latenz / Packet Loss | kein kaskadierender Ausfall | p95/p99 + Errors |
| 9 | fehlerhafter Rollout | alte gesunde Pods bleiben verfügbar | Availability |
| 10 | Node Drain | Replicas bleiben verfügbar | Ready Replicas |
| 11 | komplette K3s-VM weg | externer Failover übernimmt | Umschaltzeit |
| 12 | Proxmox/Standort weg | Hetzner hält den Blog online | End-to-End Availability |

Die ersten beiden Stufen habe ich bereits gemessen.

Beim dritten Experiment bin ich gerade an einer anderen wichtigen Lektion angekommen:

> Auch ein Chaos-Test selbst braucht Observability.

Mein erster Search-Versuch lieferte kein verwertbares Resultat.

Der nächste Versuch brach bereits im Preflight ab.

Das ist kein nutzloses Ergebnis.

Es zeigt, dass auch der Experiment-Runner selbst sauber unterscheiden muss zwischen:

~~~text
Experiment fehlgeschlagen
~~~

und:

~~~text
Experiment wurde gar nicht erst gestartet
~~~

Deshalb gibt mein Runner inzwischen sanitisiert Zustände wie:

~~~text
ABORTED
failureStage: preflight
~~~

aus.

Der Test des Testsystems gehört also ebenfalls dazu.

## Tools: vom kleinen Runner bis Chaos Mesh

Für Chaos Engineering gibt es sehr unterschiedliche Werkzeuge.

### Eigener kleiner Runner

Für eng begrenzte Experimente kann ein kleiner eigener Runner sinnvoll sein.

Vorteile:

~~~text
kleine Angriffsfläche
wenige Berechtigungen
vollständig nachvollziehbarer Code
genau ein gewünschtes Experiment
~~~

Nachteile:

~~~text
jede neue Fehlerklasse muss selbst gebaut werden
Observability muss selbst entstehen
Recovery und Cleanup müssen selbst abgesichert werden
~~~

Für meine ersten Pod- und Search-Experimente ist das bewusst mein Ansatz.

### Netflix Chaos Monkey

Chaos Monkey konzentriert sich historisch stark auf das absichtliche Beenden von Instanzen beziehungsweise Containern.

Das ist sehr wertvoll, wenn genau diese Hypothese getestet werden soll.

Für DNS, Netzwerk, IO oder CPU-Stress braucht man aber andere Mechanismen.

### LitmusChaos

Litmus ist eine umfangreichere Chaos-Engineering-Plattform für Cloud-Native-Umgebungen.

Interessant wird das, wenn Experimente:

~~~text
wiederverwendbar
orchestriert
CI/CD-integriert
als Workflows modelliert
~~~

werden sollen.

### Chaos Mesh

Chaos Mesh deckt deutlich mehr Fehlerarten ab.

Dazu gehören unter anderem:

~~~text
Pod Chaos
Network Chaos
DNS Chaos
HTTP Chaos
Stress Chaos
IO Chaos
Time Chaos
~~~

Spätestens wenn ich kontrolliert Packet Loss, Latenz, CPU-/Memory-Stress oder DNS-Fehler erzeugen will, ist ein etabliertes Werkzeug wahrscheinlich sinnvoller als immer mehr Speziallogik in meinen kleinen Runner einzubauen.

## Nicht jedes Experiment gehört sofort in Production

Die klassischen Principles of Chaos Engineering bevorzugen realistische Bedingungen und damit langfristig auch echte Production-Last.

Das bedeutet für mich aber nicht:

~~~text
erster Versuch
→ sofort Production zerstören
~~~

Meine Reihenfolge ist bewusst:

~~~text
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
erst dann über Production nachdenken
~~~

Ein Experiment, das in Staging schon unkontrolliert ist, wird in Production nicht plötzlich besser.

## Stop Conditions sind genauso wichtig wie PASS-Kriterien

Vor dem Start sollte nicht nur definiert sein, wann ein Experiment bestanden ist.

Ich brauche auch Abbruchbedingungen.

Zum Beispiel:

~~~text
Baseline bereits degradiert
→ ABORT

falscher Namespace
→ ABORT

mehr Targets als erwartet
→ ABORT

öffentlicher Healthcheck fällt bereits vorher
→ ABORT

Recovery überschreitet 120 s
→ STOP

zweite unabhängige Komponente fällt aus
→ STOP
~~~

Damit wird aus Chaos ein kontrolliertes Experiment.

Ohne Stop Conditions wird aus Chaos tatsächlich nur Chaos.

## Chaos Engineering ist kein einmaliger Stunt

Ein Experiment wird besonders interessant, wenn es nach einer Architekturänderung erneut läuft.

Zum Beispiel:

~~~text
heute:
Recovery = 6,9 s

nach neuem Init-Code:
Recovery = 14 s
~~~

Beide Tests können technisch PASS sein.

Der zweite zeigt trotzdem eine Regression.

Langfristig interessieren mich deshalb nicht nur Einzelwerte, sondern:

~~~text
Recovery-Verteilung
Fehlerrate
Latenz
Regressionen zwischen Releases
~~~

An diesem Punkt nähert sich Chaos Engineering klassischen Regressionstests an.

Nur dass die Eingabe kein normaler API-Request ist.

Die Eingabe ist ein Fehler.

## Was ich aus meinen ersten Experimenten mitnehme

Mein wichtigster Lernpunkt ist inzwischen nicht:

> Kubernetes startet Pods neu.

Das wusste ich vorher.

Interessanter ist:

> Resilience wird erst dann belastbar, wenn ich sie als Hypothese formuliere, absichtlich störe und von außen messe.

Ein Pod-Delete ist dafür nur die erste Stufe.

Danach kommen die interessanteren Fragen:

~~~text
Was passiert bei langsamen statt toten Diensten?
Was passiert bei DNS?
Was passiert bei Memory Pressure?
Was passiert beim Node Drain?
Was passiert, wenn der ganze Standort weg ist?
~~~

Je weiter ich diese Liste heruntergehe, desto weniger teste ich Kubernetes allein.

Dann teste ich die gesamte Architektur.

Und genau das ist der Punkt.

## Praxis: mein eigener Chaos Monkey

Die konkrete Umsetzung meines kleinen Staging-Runners, inklusive RBAC, Opt-in-Labels, Result-ConfigMap, Observer und echter Recovery-Messungen, steht hier:

- [[k3s-proxmox-chaos-monkey-part-5|K3s auf Proxmox – Teil V: Chaos Monkey gegen meinen eigenen Blog]]

Dort dokumentiere ich auch die Experimente selbst und erweitere die Reihe Schritt für Schritt.

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
