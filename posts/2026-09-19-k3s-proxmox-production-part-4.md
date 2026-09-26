---
id: 2026-09-19-k3s-proxmox-production-part-4
version: 1
title: 'K3s auf Proxmox – Teil IV: Production ist nicht gleich Hochverfügbarkeit'
status: publish
date: 2026-09-19T00:00:00.000Z
created_at: 2026-09-19T00:00:00.000Z
updated_at: 2026-09-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Mein Blog läuft inzwischen produktiv auf K3s mit drei Replicas, Flux und
  Cloudflare Tunnel. Der Pod-Failover funktioniert – aber ein einzelner
  Proxmox-Host bleibt trotzdem ein Single Point of Failure.
cover_query: kubernetes proxmox server datacenter infrastructure
tags:
  - Kubernetes
  - K3s
  - Proxmox
  - Flux
  - GitOps
  - Cloudflare
  - Hetzner
  - HA
  - Self-Hosting
  - DevOps
search_queries:
  - query: Wie teste ich Pod Failover bei K3s hinter einem Cloudflare Tunnel?
    maxRank: 2
  - query: Warum sind drei Kubernetes Pods noch keine echte Hochverfügbarkeit?
    maxRank: 1
  - query: Wie halte ich Hetzner parallel zu K3s als Rollback Standby aktuell?
    maxRank: 1
cover_provider: pixabay
cover_provider_id: '2001090'
cover_image: /assets/covers/2026-09-19-k3s-proxmox-production-part-4.jpg
cover_alt: >-
  cloud computing, network, internet, cloud computing concept, communication,
  networking, virtual, cloud technology, black computer, black technology, black
  laptop, black clouds, black network, black community, black internet, black
  communication, cloud computing, cloud computing, cloud computing, cloud
  computing, cloud computing
cover_focus: center
cover_credit: by wynpnt via Pixabay
cover_credit_url: 'https://pixabay.com/illustrations/cloud-computing-network-internet-2001090/'
cover_source_url: 'https://pixabay.com/illustrations/cloud-computing-network-internet-2001090/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 81
---

Teil I hat den Blog auf K3s gebracht, Teil II daraus GitOps gemacht und Teil III feste Versionen sowie verschlüsselte Secrets ergänzt.

Und inzwischen läuft mein Blog tatsächlich produktiv auf Kubernetes.

Das klingt erstmal nach einem ziemlich guten Endpunkt.

Ist es aber nicht.

Denn spätestens beim ersten echten Ausfalltest wurde klar:

> Drei Pods machen einen Dienst robuster. Sie machen aber nicht meinen Proxmox-Host hochverfügbar.

Genau darum geht es in diesem Teil.

## Von einem Pod zu drei

Mein Blog lief anfangs mit genau einem Pod.

Für Staging war das völlig ausreichend. Für Production wollte ich aber nicht, dass ein einzelner Pod-Neustart direkt sichtbar wird.

Also habe ich das Blog-Deployment auf drei Replicas erweitert:

```text
blog-production
├── blog
├── blog
├── blog
└── search
```

Der interne Kubernetes-Service verteilt Requests automatisch auf die gesunden Blog-Pods.

Dafür brauche ich keinen zusätzlichen Load Balancer innerhalb des Clusters. Der Cloudflare Tunnel spricht einfach mit dem internen Service:

```text
Cloudflare Tunnel
        ↓
Service blog
   ┌────┼────┐
   ▼    ▼    ▼
 Pod  Pod  Pod
```

Zusätzlich läuft das Deployment mit:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

Damit kann Kubernetes beim Rollout zuerst einen neuen Pod starten, bevor ein alter verschwindet.

## Pod Failover bei K3s hinter einem Cloudflare Tunnel

Der konkrete Pfad, den ich hier teste, ist:

```text
Cloudflare Tunnel
↓
K3s Service
↓
3 Blog-Pods
↓
1 Pod fällt aus
↓
Service routet weiter auf die gesunden Pods
```

Damit geht es in diesem Teil ausdrücklich um **Pod Failover bei K3s hinter einem Cloudflare Tunnel** – noch nicht um allgemeines Chaos Engineering.

## Ein echter Failure-Test statt nur grüner YAML

Konfiguration ist schön.

Ein absichtlich gelöschter Production-Pod ist aussagekräftiger.

Während eines permanenten Healthchecks habe ich einen der drei Blog-Pods gelöscht:

```bash
kubectl -n blog-production delete pod <pod>
```

Parallel lief:

```bash
while true; do
  curl -fsS --max-time 3 https://k8s-blog.obivan.org/healthz || echo FEHLER
  sleep 0.5
done
```

Kubernetes ging kurz von drei auf zwei Pods:

```text
3 Pods
↓
1 Pod gelöscht
↓
2 Pods bedienen weiter Requests
↓
Kubernetes startet Ersatz
↓
3 Pods
```

Der Blog blieb erreichbar.

Das ist einer der Momente, in denen Kubernetes für mich seinen eigentlichen Mehrwert zeigt.

Nicht weil ein Dashboard grün ist, sondern weil ich einen laufenden Pod lösche und die Anwendung trotzdem weiterläuft.

## Der erste Fehler war gar kein Kubernetes-Fehler

Beim ersten Test tauchte trotzdem einmal auf:

```text
curl: (28) Resolving timed out after 3000 milliseconds
FEHLER
```

Das sah zunächst nach einem kurzen Ausfall aus.

Der Request hatte Kubernetes aber überhaupt nicht erreicht.

Er hing bereits bei der DNS-Auflösung.

Für den eigentlichen Failover-Test habe ich DNS deshalb bewusst aus dem Messpfad genommen:

```bash
IP="$(dig +short A k8s-blog.obivan.org @1.1.1.1 | head -n1)"

curl   --resolve "k8s-blog.obivan.org:443:$IP"   https://k8s-blog.obivan.org/healthz
```

Damit teste ich tatsächlich:

```text
Cloudflare
↓
Tunnel
↓
Kubernetes Service
↓
Pods
```

Mein lokaler Resolver ist dadurch bewusst nicht Teil dieses Tests.

Eine kleine Sache, aber ein gutes Beispiel dafür, wie schnell man beim Ausfalltest die falsche Komponente beschuldigt.

## Search war der interessantere Fehler

Der Blog selbst war relativ unkompliziert.

Kernel Grep war es nicht.

Der Production-Search-Pod startete zunächst immer wieder neu. Die erste Vermutung war ein Problem mit dem Dateisystem oder den temporären Modelldaten.

`kubectl describe pod` war deutlich hilfreicher:

```text
Reason: OOMKilled
Exit Code: 137
```

Der Container hatte zunächst:

```text
Memory Limit: 1 GiB
```

Das reichte beim Initialisieren des Embedding-Modells und des Suchindex nicht zuverlässig aus.

Für Production verwende ich deshalb jetzt:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 512Mi
  limits:
    memory: 2Gi
```

Danach lief der Rollout sauber durch.

Wichtig ist dabei die andere Seite:

Meine K3s-VM hat derzeit nur 4 GB RAM und beherbergt gleichzeitig Staging und Production.

```text
mehr Container-RAM
≠
mehr Host-RAM
```

Wenn der Node irgendwann unter Memory Pressure gerät, muss ich die VM vergrößern. Einfach die Container-Limits immer weiter hochzusetzen wäre nur Symptombehandlung.

## Erst Canary, dann echter Hostname

Bevor ich den echten Blog umgestellt habe, bekam die K3s-Production einen separaten öffentlichen Hostnamen:

```text
k8s-blog.obivan.org
```

Der bestehende Cloudflare Tunnel bedient damit mehrere Hostnames:

```text
staging-blog.obivan.org
→ blog.blog-staging.svc.cluster.local:80

k8s-blog.obivan.org
→ blog.blog-production.svc.cluster.local:80
```

Damit konnte ich die Production-Workloads öffentlich testen, ohne sofort `blog.obivan.org` umzuschalten.

Das Canary-Skript prüft unter anderem:

```text
/healthz
/
/archive
/grep
/api/search
```

Erst nachdem Blog, Search und der Pod-Failover funktioniert hatten, habe ich auch den echten Hostnamen auf die K3s-Production umgestellt:

```text
blog.obivan.org
→ K3s Production
```

## Der eigentliche Stolperstein war danach das Deployment

Traffic auf Kubernetes zu schicken ist nur die halbe Migration.

Mein bestehender Production-Workflow hatte bisher eine andere Annahme:

```text
main
↓
GitHub Actions
↓
Hetzner Docker Compose
```

Bei reinen Content-Änderungen wurden Posts, Snippets, Assets und Archiv direkt in Docker-Volumes auf Hetzner synchronisiert.

K3s verwendet diese Volumes aber nicht.

Dort steckt der Content direkt im Container-Image.

Damit hätte Folgendes passieren können:

```text
Obsidian
↓
main
↓
Hetzner bekommt neuen Artikel

K3s
↓
altes Image
↓
Artikel fehlt
```

Technisch wäre der neue Production-Origin gesund gewesen – nur eben mit altem Inhalt.

Das wollte ich unbedingt vermeiden.

## Deshalb jetzt Dual-Deployment

Ich habe den Production-Flow deshalb bewusst nicht einfach von Hetzner auf K3s umgestellt.

Beide bleiben aktiv:

```text
                    main
                     │
             ┌───────┴───────┐
             │               │
             ▼               ▼
          Hetzner            K3s
```

Hetzner bekommt weiterhin den bestehenden Content- beziehungsweise Compose-Deploy.

K3s bekommt zusätzlich für jeden relevanten Main-Stand neue, unveränderliche Images:

```text
ghcr.io/0b-ivan/kernel-notes-blog:<git-sha>
ghcr.io/0b-ivan/kernel-notes-search:<git-sha>
```

Auch reine Content-Änderungen erzeugen für K3s neue Images.

Damit ist ein veröffentlichter Artikel Bestandteil genau des Images, das Production später ausführt.

## Production folgt nicht mehr direkt `staging`

Während der Migration hatte die Production-Kustomization ihren Zustand zunächst ebenfalls aus dem `staging`-Branch gelesen.

Für Tests war das praktisch.

Für echten Betrieb gefällt mir das nicht.

Eine Änderung, die noch nicht nach `main` promotet wurde, sollte Production niemals beeinflussen können.

Deshalb gibt es jetzt einen eigenen Branch:

```text
production-gitops
```

Flux liest Production über eine eigene Source:

```text
GitRepository blog-production-source
        ↓
branch: production-gitops
        ↓
infra/kubernetes/production
```

Der K3s-Production-Workflow läuft erst nach einem Merge nach `main`.

Er:

1. baut Blog und Search,
2. pusht beide Images mit dem Git-SHA,
3. synchronisiert nur die Production-relevanten Kubernetes-Manifeste,
4. pinnt beide Images auf genau diesen Main-SHA,
5. lässt Flux ausrollen,
6. prüft anschließend den öffentlichen Canary inklusive einer echten Kernel-Grep-Abfrage.

Damit ist die Kette wieder nachvollziehbar:

```text
Commit
→ Image
→ GitOps Desired State
→ Flux
→ Kubernetes Deployment
```

## Hetzner bleibt absichtlich aktuell

Den alten Hetzner-Server habe ich nicht abgeschaltet.

Noch wichtiger: Er bekommt weiterhin neuen Content.

Damit ist Hetzner nach dem K3s-Cutover nicht einfach ein altes Backup, sondern ein aktuelles Standby-System.

```text
main
├── K3s Production
└── Hetzner Standby
```

Das ist für mich während der Migration deutlich angenehmer als ein harter Wechsel mit anschließendem Rückbau der alten Plattform.

Falls ich zurückwechseln muss, will ich nicht erst einen alten Server restaurieren.

Ich will nur den Traffic umschalten.

## Und Obsidian?

Mein Authoring-Setup bleibt zunächst auf Hetzner.

```text
Obsidian
↕
LiveSync / CouchDB
↓
Publisher
↓
staging
↓
main
```

Auch der Rückweg bleibt bestehen:

```text
main
↓
sync-main-to-obsidian
↓
Headless Vault auf Hetzner
↓
LiveSync
↓
Obsidian
```

Die Migration der Blog-Auslieferung zu Kubernetes zwingt mich also nicht dazu, gleichzeitig LiveSync, CouchDB und den Publisher umzuziehen.

Ich mag solche Migrationen lieber in kleinen, reversiblen Schritten.

## Drei Pods sind trotzdem noch kein echtes HA

Und damit komme ich zum wichtigsten Punkt dieses Teils.

Aktuell sieht Production grob so aus:

```text
Proxmox
└── K3s VM
    ├── Blog Pod
    ├── Blog Pod
    ├── Blog Pod
    └── Search Pod
```

Wenn ein Blog-Pod stirbt:

```text
kein Problem
```

Wenn zwei Blog-Pods sterben:

```text
der Service kann immer noch weiterlaufen
```

Wenn die gesamte K3s-VM stirbt:

```text
Problem
```

Wenn der Proxmox-Host stirbt:

```text
Problem
```

Wenn mein Anschluss zu Hause weg ist:

```text
Problem
```

Das ist für mich inzwischen die wichtigste Unterscheidung:

```text
Application HA
≠
Infrastructure HA
```

Innerhalb des Clusters ist die Anwendung inzwischen deutlich robuster.

Der Cluster selbst hängt aber weiterhin an einem einzelnen Standort und einem einzelnen Proxmox-Host.

## Der zweite Standort existiert eigentlich schon

Durch den parallelen Hetzner-Betrieb habe ich bereits zwei voneinander unabhängige Plattformen:

```text
Standort 1
Proxmox / K3s

Standort 2
Hetzner / Docker Compose
```

Aktuell ist Hetzner nur Standby.

Damit liegt der nächste Versuch ziemlich nahe.

## Nächster Schritt: eigener Failover statt sofort Cloudflare Load Balancing

Eine Möglichkeit wäre Cloudflare Load Balancing.

Für meinen kleinen Aufbau möchte ich aber zuerst ausprobieren, wie weit ich mit eigener Infrastruktur komme.

Die Idee:

```text
Internet
↓
Cloudflare
↓
HAProxy auf Hetzner
   │
   ├── Primary → K3s
   │
   └── Backup  → lokaler Hetzner Blog
```

HAProxy könnte regelmäßig den K3s-Canary prüfen:

```text
https://k8s-blog.obivan.org/healthz
```

Solange K3s gesund ist:

```text
HAProxy → K3s
```

Nach mehreren fehlgeschlagenen Healthchecks:

```text
HAProxy → Hetzner
```

Und wenn K3s wieder stabil verfügbar ist:

```text
HAProxy → K3s
```

Damit wäre der nächste Ausfalltest nicht mehr:

```text
einen Pod löschen
```

sondern:

```text
Proxmox ausschalten
```

Der Blog sollte dann trotzdem online bleiben.

Genau das ist die Art Test, die mich deutlich mehr interessiert als ein weiterer grüner Status im Dashboard.

## Zwischenstand

Aus einem einzelnen Docker-Container ist inzwischen geworden:

```text
Obsidian
↓
Git
↓
Staging
↓
öffentlicher Gate
↓
main
↓
Dual Production Deployment
   ├── K3s / Proxmox
   └── Hetzner
```

Kubernetes übernimmt Pod-Failover und Rolling Updates.

Flux übernimmt den gewünschten Cluster-Zustand.

Cloudflare bringt den Traffic ins private Netz.

Hetzner bleibt als unabhängiger zweiter Standort aktuell.

Und trotzdem würde ich das Ganze noch nicht als wirklich hochverfügbar bezeichnen.

Dafür fehlt noch der wichtigste Test:

> Proxmox aus. Blog bleibt online.

Das ist der nächste Schritt.

## Die bisherigen Teile

- [[k3s-proxmox-cloudflare-part-1|Teil I: Blog-Staging mit Cloudflare Tunnel]]
- [[k3s-proxmox-flux-gitops-part-2|Teil II: GitOps mit Flux und echtem Staging]]
- [[k3s-proxmox-hardening-part-3|Teil III: Feste Versionen und verschlüsselte Secrets]]

## Weiter mit Teil V

- [[k3s-proxmox-chaos-monkey-part-5|Teil V: Chaos Monkey gegen meinen eigenen Blog]]
