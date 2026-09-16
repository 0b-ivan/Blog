---
id: 2026-09-15-k3s-proxmox-cloudflare-part-1
version: 2
title: "K3s auf Proxmox – Teil I: Blog-Staging mit Cloudflare Tunnel"
status: publish
date: 2026-09-15
created_at: 2026-09-15
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Auftakt einer Reihe über mein neues Blog-Staging: Warum Produktion auf Hetzner bleibt, weshalb K3s im Proxmox-Homelab läuft und wie der erste öffentliche Healthcheck über Cloudflare zustande kommt."
tags:
  - Kubernetes
  - K3s
  - Proxmox
  - Cloudflare
  - Cloudflare-Tunnel
  - GHCR
  - Ansible
  - Homelab
  - DevOps
  - Self-Hosting
search_queries:
  - query: Wie installiere ich K3s auf einer Proxmox VM und veröffentliche einen Service über Cloudflare Tunnel?
    maxRank: 1
  - query: Wie betreibe ich Kubernetes im Homelab ohne Portfreigabe am Router?
    maxRank: 1
  - query: Wie ziehe ich private GHCR Images in K3s?
    maxRank: 1
snippets:
  - file: "01-k3s-ansible-bootstrap.yml"
    title: "K3s-Node mit Ansible bootstrappen"
    description: "Installiert Basis-Pakete, aktiviert den QEMU Guest Agent und konfiguriert K3s ohne Traefik und ServiceLB."
    type: "Ansible-Playbook"
    language: "yaml"
  - file: "02-ghcr-pull-secret.sh"
    title: "GHCR Pull Secret für den Staging-Namespace"
    description: "Erzeugt ein Docker-Registry-Secret für private GHCR Images, ohne Credentials in Git abzulegen."
    type: "Shellskript"
    language: "bash"
  - file: "03-blog-search-services.yml"
    title: "Interne ClusterIP-Services für Blog und Search"
    description: "Definiert die internen Kubernetes Services, über die Blog und Search miteinander sprechen."
    type: "Kubernetes-Manifest"
    language: "yaml"
  - file: "04-internal-healthchecks.sh"
    title: "Blog intern per ClusterIP und Kubernetes DNS testen"
    description: "Prüft den Blog zuerst direkt über die ClusterIP und anschließend aus einem temporären Pod."
    type: "Shellskript"
    language: "bash"
  - file: "05-cloudflared-deployment.yml"
    title: "cloudflared als Deployment im Cluster"
    description: "Startet cloudflared mit einem Tunnel-Token aus einem Kubernetes Secret."
    type: "Kubernetes-Manifest"
    language: "yaml"
  - file: "06-cross-namespace-healthcheck.sh"
    title: "Cloudflare-Namespace gegen den Blog-Service testen"
    description: "Prüft die Erreichbarkeit des Blog-Service über den vollständigen Kubernetes DNS-Namen."
    type: "Shellskript"
    language: "bash"
---

Mein Blog läuft produktiv auf Hetzner. Dort ist der Stack inzwischen angenehm unspektakulär: Docker Compose startet die Anwendung, die Images kommen aus GHCR und `blog.obivan.org` ist der öffentliche Endpunkt.

Und genau deshalb wollte ich die Produktion nicht einfach auf Kubernetes umziehen.

Ein funktionierendes Produktionssystem ist ein schlechter Ort, um nebenbei zu lernen, wie sich Deployments, Services, Probes, Secrets, GitOps und Cluster-Networking in der eigenen Anwendung wirklich verhalten.

Was mir stattdessen gefehlt hat, war eine **echte Staging-Umgebung**.

Nicht ein zweiter Container auf demselben Server und auch kein Kubernetes-Tutorial mit Nginx, sondern derselbe Blog, dieselben Images und dieselben Abhängigkeiten wie später in Produktion – nur in einer Umgebung, die ich gefahrlos zerlegen kann.

Dafür steht bei mir ohnehin Proxmox im Homelab. Die Hardware ist da, das Netz ist getrennt und ein kaputter K3s-Node reißt mir nicht den produktiven Blog mit.

So entstand die Idee für diese Reihe.

## Worum es in dieser Reihe geht

Kubernetes ist hier nicht das eigentliche Ziel. Das Ziel ist ein sauberer Deployment-Pfad für meinen Blog:

```text
Änderung
   ↓
Pull Request
   ↓
Staging
   ↓
automatische Prüfung
   ↓
Promotion
   ↓
Produktion
```

Ich baue diesen Weg bewusst schrittweise auf.

**Teil I** schafft zunächst die technische Basis: eine Debian-VM auf Proxmox, K3s, die Blog-Workloads, private Images aus GHCR und einen Cloudflare Tunnel bis zum ersten öffentlichen Healthcheck.

**Teil II** setzt darauf GitOps mit Flux, immutable Image-Tags, den `staging`-Branch und einen echten Promotion-Pfad Richtung `main`.

Weitere Schritte können danach dort ansetzen, wo sie tatsächlich gebraucht werden: Secret-Management, Persistenz, Observability, Backups oder später auch mehr als ein einzelner Node.

Ich möchte dabei nicht möglichst viele Kubernetes-Komponenten sammeln. Jede zusätzliche Schicht soll ein konkretes Problem lösen.

## Warum Staging auf Proxmox?

Produktion und Staging erfüllen bei mir bewusst unterschiedliche Aufgaben.

```text
Produktion
Hetzner
Docker Compose
blog.obivan.org
stabil und möglichst langweilig

Staging
Proxmox Homelab
K3s
staging-blog.obivan.org
experimentieren, testen, automatisieren
```

Hetzner bleibt zunächst die produktive Plattform, weil der bestehende Docker-Compose-Stack funktioniert und leicht zu betreiben ist.

Proxmox eignet sich dagegen hervorragend für Staging, weil ich dort Kontrolle über VM, Netzwerk und Ressourcen habe und Fehler ausdrücklich erlaubt sind. Wenn ich K3s neu installieren, ein Manifest zerlegen oder den kompletten Node ersetzen möchte, betrifft das nicht die öffentliche Produktion.

Außerdem bekomme ich damit eine realistische Umgebung für Änderungen am Blog selbst. Ein neues Image muss nicht nur lokal starten, sondern auch mit Kubernetes DNS, Services, Probes und dem Search-Service zusammenspielen.

Genau das ist für mich der eigentliche Grund für diesen Aufbau: **Staging soll Probleme finden, bevor Produktion sie findet.**

## Ziel von Teil I

Der erste Schritt ist bewusst klein gehalten. Diese Kette soll funktionieren:

```text
GitHub / GHCR
     │
     │ Container Images
     ▼
Proxmox
     │
     ▼
Debian 13 VM
     │
     ▼
K3s
 ┌───────────────┐
 │ Blog          │
 │ Kernel Grep   │
 │ cloudflared   │
 └───────────────┘
     │
     │ ausgehender Tunnel
     ▼
Cloudflare
     │
     ▼
staging-blog.obivan.org
```

Keine öffentliche IP für den Kubernetes-Node, kein NodePort ins Internet, kein Portforwarding auf dem Router und zunächst auch kein Ingress Controller.

Am Ende soll schlicht dieser Test funktionieren:

```bash
curl -fsS https://staging-blog.obivan.org/healthz
```

mit:

```text
ok
```

Der einzelne String ist wenig spektakulär. Spannend ist die komplette Kette, die dafür funktionieren muss.

## Warum K3s?

Für ein Homelab wollte ich kein unnötig großes Kubernetes-Setup bauen.

K3s bringt die Mechanismen mit, die ich für dieses Projekt brauche, ohne dass ich für den Einstieg gleich mehrere Control-Plane-Nodes betreiben muss:

- Deployments
- Services
- Namespaces
- Secrets
- Container Registry Authentication
- Health Probes
- CNI und Pod-Netzwerk
- Kustomize
- später Flux und GitOps

Für diese erste Ausbaustufe reicht ein einzelner Node:

```text
Proxmox
└── k3s-blog-01
    ├── Control Plane
    └── Worker
```

High Availability würde an dieser Stelle vor allem mehr bewegliche Teile hinzufügen. Erst wenn der einfache Pfad sauber funktioniert, lohnt sich die nächste Komplexitätsstufe.

## Die VM in Proxmox

Als Basis dient eine Debian-13-VM mit dem Generic Cloud Image.

```text
VM:        k3s-blog-01
OS:        Debian 13 (Trixie)
vCPU:      2
RAM:       4 GB
Disk:      32 GB
Storage:   ZFS
Network:   internes Service-Netz
Public IP: keine
```

Cloud-Init liefert mir direkt User, SSH-Key und Netzwerkkonfiguration, ohne dass ich Debian interaktiv installieren muss.

Der grobe Ablauf ist:

```text
Debian Cloud Image
      ↓
VM anlegen
      ↓
Disk importieren
      ↓
Cloud-Init hinzufügen
      ↓
SSH-Key + User setzen
      ↓
internes Netzwerk
      ↓
VM starten
```

Der Node steht in einem internen Service-Netz. Für den ersten Bootstrap habe ich deshalb den Proxmox-Host selbst temporär als Ansible-Controller verwendet.

Das ist bewusst nur Bootstrap. In Teil II verschwindet dieser manuelle Controller wieder aus dem normalen Deployment-Pfad.

## K3s mit Ansible statt per Copy-and-Paste

Ich wollte aus dem Aufbau keinen Stapel einmaliger Shell-Kommandos machen.

Deshalb liegt der Bootstrap im Repository unter `infra/ansible/`. Dabei werden unter anderem der QEMU Guest Agent installiert, die K3s-Konfiguration erzeugt und Traefik sowie ServiceLB deaktiviert.

[K3s-Node mit Ansible bootstrappen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/01-k3s-ansible-bootstrap.yml "snippet:yaml")

Der QEMU Guest Agent ist dabei mehr als Kosmetik. Ohne ihn sieht Proxmox aus dem Guest heraus deutlich schlechter, welche Interfaces und IP-Adressen die VM tatsächlich besitzt.

Zwei K3s-Einstellungen sind für diesen Aufbau besonders wichtig:

```yaml
secrets-encryption: true
disable:
  - traefik
  - servicelb
```

`secrets-encryption` verschlüsselt Kubernetes Secrets im Datastore. Traefik und ServiceLB brauche ich für diese erste Variante nicht, weil der öffentliche Zugriff ausschließlich über Cloudflare Tunnel erfolgt.

Damit bleibt die Architektur zunächst bewusst klein:

```text
Kein Ingress
Kein NodePort
Kein LoadBalancer
Kein Router-Portforwarding
```

## Der erste Ansible-Lauf

Vor dem Playbook prüfe ich zunächst die Verbindung:

```bash
ansible all -m ping
```

Erwartet wird ein `pong` vom Node.

Danach folgen Syntaxcheck und Playbook:

```bash
ansible-playbook playbooks/k3s.yml --syntax-check
ansible-playbook playbooks/k3s.yml
```

Nach dem ersten erfolgreichen Lauf war aus der normalen Debian-VM ein K3s-Node geworden.

Ein laufender `k3s.service` allein reicht mir allerdings nicht als Erfolgskriterium. Kubernetes selbst muss den Node als `Ready` sehen:

```bash
sudo k3s kubectl get nodes -o wide
```

Bei meinem Aufbau:

```text
NAME          STATUS   ROLES           VERSION
k3s-blog-01   Ready    control-plane   v1.36.4+k3s1
```

Danach kontrolliere ich die System-Pods:

```bash
sudo k3s kubectl get pods -A -o wide
```

Für diesen Stand waren vor allem CoreDNS, der Local Path Provisioner und der Metrics Server relevant.

## Was im Cluster läuft

Die Anwendung besteht im Staging zunächst aus zwei eigenen Workloads:

```text
blog-staging Namespace
│
├── Deployment: blog
│   └── Service: blog :80
│
└── Deployment: search
    └── Service: search :8090
```

`cloudflared` läuft getrennt davon:

```text
cloudflare Namespace
└── Deployment: cloudflared
```

Diese Trennung ist Absicht. Der Blog selbst kennt Cloudflare nicht. `cloudflared` kennt wiederum keinen Pod direkt, sondern nur den internen Kubernetes-Service.

## Private Images aus GHCR

Die Blog-Images liegen in GHCR und das Repository ist privat. K3s benötigt deshalb Registry-Credentials.

Für den Bootstrap erzeuge ich ein Docker-Registry-Secret im Namespace:

[GHCR Pull Secret für den Staging-Namespace](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/02-ghcr-pull-secret.sh "snippet:bash")

Das Deployment referenziert anschließend nur den Secret-Namen:

```yaml
imagePullSecrets:
  - name: ghcr-pull
```

Der Token selbst gehört weder in Git noch in ein Kubernetes-Manifest.

Für den Bootstrap reicht dieses Verfahren. Langfristiges Secret-Management ist ein eigener Baustein und bewusst nicht Voraussetzung für den ersten funktionierenden Staging-Pfad.

## Blog und Search als interne Services

Blog und Search werden als normale `ClusterIP`-Services veröffentlicht.

[Interne ClusterIP-Services für Blog und Search](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/03-blog-search-services.yml "snippet:yaml")

Der Blog spricht den Search-Service nicht über eine feste Pod-IP an, sondern über Kubernetes DNS:

```text
http://search:8090/search
```

Damit ist es egal, auf welcher Pod-IP Search nach einem Restart wieder erscheint. Der Service bleibt die stabile Adresse.

## Erst intern testen

Bevor Cloudflare überhaupt beteiligt ist, muss die Anwendung im Cluster funktionieren.

Ich teste deshalb zuerst direkt gegen die ClusterIP und danach aus einem temporären Pod über den Service-Namen:

[Blog intern per ClusterIP und Kubernetes DNS testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/04-internal-healthchecks.sh "snippet:bash")

Beide Wege müssen `ok` liefern.

Damit sind bereits mehrere Schichten geprüft:

```text
Blog Pod                ✓
Service Routing         ✓
Kubernetes DNS          ✓
HTTP Health Endpoint    ✓
```

Erst danach lohnt es sich, einen öffentlichen Pfad davorzusetzen.

## Ein Restart beim Search-Start

Beim ersten Aufbau war der Search-Container kurz `Running`, noch nicht `Ready` und hatte einen Restart.

Aus diesem einzelnen Ereignis ließ sich die konkrete Ursache nicht sauber bestimmen. Deshalb behandle ich den Restart nicht rückwirkend als bewiesenen Probe-Fehler.

Was sich aber unabhängig davon aus dem Startverhalten ableiten lässt: Search kann beim ersten Start mehr Zeit benötigen als der kleine Webserver, weil unter anderem Modell und Daten initialisiert werden.

Dafür ist eine `startupProbe` sinnvoll. Sie gibt der Anwendung eine eigene Startphase, bevor die normale Liveness-Prüfung relevant wird.

Der wichtige Punkt ist für mich deshalb nicht „eine Probe hat den Fehler verursacht“, sondern: **Healthchecks müssen zum tatsächlichen Startverhalten der Anwendung passen.**

## Cloudflare Tunnel direkt im Cluster

Für den öffentlichen Zugriff möchte ich weiterhin keinen eingehenden Port am Kubernetes-Node öffnen.

`cloudflared` läuft deshalb als eigenes Deployment im Cluster und baut selbst die Verbindung zum Cloudflare Edge auf.

[cloudflared als Deployment im Cluster](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/05-cloudflared-deployment.yml "snippet:yaml")

Das Tunnel-Token liegt in einem Kubernetes Secret. Im Deployment steht nur die Referenz darauf.

Die Richtung bleibt damit:

```text
cloudflared Pod
      │
      │ ausgehende Verbindung
      ▼
Cloudflare Edge
```

Es gibt weiterhin keine eingehende Verbindung zum Node.

## Tunnel-Pfad intern testen

Bevor ich DNS oder TLS debugge, teste ich aus dem `cloudflare`-Namespace, ob der Blog über seinen vollständigen Cluster-DNS-Namen erreichbar ist:

[Cloudflare-Namespace gegen den Blog-Service testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/06-cross-namespace-healthcheck.sh "snippet:bash")

Der Zielname lautet:

```text
blog.blog-staging.svc.cluster.local
```

Wenn dieser Test `ok` liefert, steht die interne Kette:

```text
cloudflared Pod
      ↓
Kubernetes DNS
      ↓
blog.blog-staging.svc.cluster.local
      ↓
Blog Service
      ↓
Blog Pod
```

## Cloudflare Published Application

Im Tunnel zeigt der öffentliche Hostname anschließend direkt auf den internen Kubernetes-Service:

```text
http://blog.blog-staging.svc.cluster.local:80
```

Damit entsteht der vollständige Weg:

```text
Internet
   │
   ▼
staging-blog.obivan.org
   │
   ▼
Cloudflare Edge
   │
   │ Tunnel
   ▼
cloudflared Pod
   │
   ▼
blog.blog-staging.svc.cluster.local
   │
   ▼
Blog Service
   │
   ▼
Blog Pod
```

Kein Port 80 oder 443 am Router. Kein Port auf Proxmox. Kein NodePort im Cluster.

## DNS war da, TLS trotzdem nicht

Mein erster Hostname war:

```text
staging.blog.obivan.org
```

DNS ließ sich bereits auflösen, trotzdem endete der HTTPS-Test mit einem TLS-Handshake-Fehler.

Der praktische Stolperstein war die zusätzliche Hostname-Ebene. Ein übliches Zertifikat für `*.obivan.org` deckt `staging-blog.obivan.org` ab, aber nicht automatisch `staging.blog.obivan.org`.

Für dieses Staging wollte ich daraus kein separates Zertifikatsprojekt machen. Deshalb wurde aus

```text
staging.blog.obivan.org
```

schlicht:

```text
staging-blog.obivan.org
```

Danach prüfe ich erst DNS:

```bash
dig +short staging-blog.obivan.org @1.1.1.1
```

und anschließend HTTP:

```bash
curl -I https://staging-blog.obivan.org
curl -fsS https://staging-blog.obivan.org/healthz
```

Der entscheidende Moment war schließlich:

```text
HTTP/2 200
```

und:

```text
ok
```

Damit lief mein Blog zum ersten Mal aus dem K3s-Staging im Homelab öffentlich über Cloudflare.

## Was dieser eine Healthcheck tatsächlich beweist

Der Test sieht klein aus, bestätigt aber eine ziemlich lange Kette:

```text
Debian VM                  ✓
QEMU Guest Agent           ✓
Ansible Bootstrap          ✓
K3s Control Plane          ✓
CNI / Pod-Netzwerk         ✓
CoreDNS                    ✓
GHCR Authentication        ✓
Blog Deployment            ✓
Search Deployment          ✓
ClusterIP Services         ✓
Kubernetes DNS             ✓
Cloudflare Tunnel          ✓
Public DNS                 ✓
TLS                        ✓
Externer Healthcheck       ✓
```

Und weiterhin bewusst nicht vorhanden:

```text
Öffentliche Node-IP        ✗
Router-Portfreigabe        ✗
NodePort                   ✗
LoadBalancer               ✗
Ingress Controller         ✗
```

Genau so sollte die erste Ausbaustufe aussehen.

## Was noch provisorisch ist

Teil I ist eine funktionierende Basis, aber noch kein fertiger GitOps-Betrieb.

Bewusst einfach bleiben zunächst:

- ein einzelner K3s-Node
- Search-Daten und Modelle auf `emptyDir`
- Registry Secret manuell erzeugt
- Cloudflare Tunnel Secret manuell erzeugt
- Bootstrap manuell angestoßen
- Images zunächst über die Manifeste gesetzt
- Proxmox-Host temporär als Ansible-/Admin-Controller verwendet

Das ist kein Versehen. Ich wollte zuerst den kompletten Request-Pfad verstehen und testen, bevor eine Automatisierung darüberliegt.

## Zwischenstand

Nach Teil I sieht der Pfad so aus:

```text
GitHub / GHCR
     ↓
K3s auf Proxmox
     ↓
Blog + Search
     ↓
Cloudflare Tunnel
     ↓
staging-blog.obivan.org
     ↓
HTTP 200
```

Die Anwendung läuft damit tatsächlich im Homelab und ist von außen erreichbar, ohne dass ich dafür mein internes Netz direkt öffnen musste.

Für mich ist das die bessere Reihenfolge als sofort mit GitOps, HA, Ingress, Cert-Manager und weiteren Komponenten zu beginnen.

Erst muss die einfache Kette funktionieren.

Dann darf sie automatisch werden.

## Ausblick auf Teil II

Im nächsten Teil ändert sich der Schwerpunkt deutlich.

Der Cluster funktioniert bereits. Jetzt soll der manuelle Deployment-Pfad verschwinden:

```text
staging Branch
      ↓
GitHub Actions
      ↓
immutable SHA Images in GHCR
      ↓
Git aktualisiert Desired State
      ↓
Flux reconciled K3s
      ↓
öffentlicher Staging-Smoke-Test
      ↓
Promotion-PR nach main
```

Damit wird aus „ich kann meinen Blog auf K3s starten“ ein reproduzierbarer Staging-Prozess.

Genau darum geht es in **Teil II: GitOps mit Flux und echtem Staging**.

## Querverweise

- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[docker-vs-docker-compose|Docker vs. Docker Compose]]

## Quellen

- [Cloudflare Tunnel](/sources.html#cloudflare-tunnel)
