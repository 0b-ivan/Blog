---
id: 2026-09-15-k3s-proxmox-cloudflare-part-1
version: 1
title: "K3s auf Proxmox – Part 1: Blog-Staging mit Cloudflare Tunnel"
status: publish
date: 2026-09-15
created_at: 2026-09-15
updated_at: 2026-09-15
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Vom leeren Debian-13-Guest auf Proxmox bis zum ersten HTTP-200 über Cloudflare: K3s, Ansible, GHCR, ClusterIP-Services und ein Tunnel ohne offene Ports."
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
---

Mein Blog läuft produktiv weiterhin auf Hetzner mit Docker Compose. Daran wollte ich zunächst überhaupt nichts ändern.

Was mir gefehlt hat, war eine **echte Staging-Umgebung**, in der ich Kubernetes nicht nur in einem Tutorial, sondern mit einer Anwendung aus meinem eigenen Stack betreiben kann.

Also habe ich genau dafür einen kleinen K3s-Cluster in meinem Proxmox-Homelab aufgebaut.

Das Ziel für Part 1 war bewusst überschaubar:

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

Keine öffentliche IP für den Kubernetes-Node, kein NodePort ins Internet, kein Portforwarding auf dem Router und auch kein zusätzlicher Reverse Proxy vor dem Cluster.

Am Ende sollte einfach das hier funktionieren:

```bash
curl -fsS https://staging-blog.obivan.org/healthz
```

mit der Antwort:

```text
ok
```

Das klingt erstmal unspektakulär. Der interessante Teil steckt aber in allem, was zwischen der leeren VM und diesem `ok` liegt.

## Warum K3s und nicht gleich ein großes Kubernetes-Setup?

Für mein Homelab wollte ich kein künstlich aufgeblasenes Cluster bauen.

K3s passt hier ziemlich gut, weil es Kubernetes stark vereinfacht, aber trotzdem die Dinge mitbringt, die ich lernen und später produktiv nutzen möchte:

- Deployments
- Services
- Namespaces
- Secrets
- Container Registry Authentication
- Health Probes
- CNI / Pod-Netzwerk
- Kustomize
- später Flux und GitOps

Für Part 1 reicht ein einzelner Control-Plane-Node völlig aus.

```text
Proxmox
└── k3s-blog-01
    ├── Control Plane
    └── Worker
```

High Availability wäre an dieser Stelle nur zusätzliche Komplexität gewesen, ohne dass ich daraus für diesen ersten Schritt viel gewonnen hätte.

## Die VM in Proxmox

Als Basis habe ich eine kleine Debian-13-VM angelegt.

Der Guest ist bewusst unspektakulär dimensioniert:

```text
VM:       k3s-blog-01
OS:       Debian 13 (Trixie)
vCPU:     2
RAM:      4 GB
Disk:     32 GB
Storage:  ZFS
Network:  internes Service-Netz
Public IP: keine
```

Als Image nutze ich das Debian Generic Cloud Image. Damit bekomme ich Cloud-Init direkt mit und muss die VM nicht interaktiv installieren.

Der Ablauf auf Proxmox ist im Kern:

```text
Debian Cloud Image
      ↓
VM anlegen
      ↓
Disk importieren
      ↓
Cloud-Init Disk hinzufügen
      ↓
SSH-Key + User setzen
      ↓
internes Netzwerk per DHCP
      ↓
VM starten
```

Wichtig war für mich dabei vor allem, dass der Node **nicht direkt aus meinem Client-Netz erreichbar sein muss**.

Der Cluster steht in einem internen Service-Netz. Für den Bootstrap habe ich deshalb den Proxmox-Host selbst temporär als Ansible-Controller benutzt.

Das ist noch nicht die endgültige Betriebsform. Genau diesen manuellen Controller wollen wir in Part 2 mit GitOps wieder aus dem Deployment-Pfad entfernen.

## QEMU Guest Agent nicht vergessen

Eine Kleinigkeit, die schnell nervt: Proxmox kann ohne QEMU Guest Agent nicht sauber aus dem Guest herauslesen, welche IP-Adressen die VM tatsächlich hat.

Deshalb gehört bei mir inzwischen direkt in den Bootstrap:

```yaml
- name: Install base packages
  ansible.builtin.apt:
    name:
      - ca-certificates
      - curl
      - qemu-guest-agent
    state: present
    update_cache: true

- name: Ensure QEMU guest agent is enabled and running
  ansible.builtin.systemd_service:
    name: qemu-guest-agent
    enabled: true
    state: started
```

Danach liefert Proxmox über den Guest Agent sauber die Interfaces des Guests zurück.

Das klingt banal, macht spätere Automatisierung aber deutlich angenehmer.

## K3s nicht per Hand, sondern mit Ansible

Ich wollte den Node nicht mit einer Sammlung von Copy-and-Paste-Kommandos aufbauen.

Deshalb liegt der Bootstrap direkt im Blog-Repository unter:

```text
infra/
└── ansible/
    ├── inventory/
    └── playbooks/
        └── k3s.yml
```

Das Inventory enthält nur die Verbindung zum internen Node. Secrets bleiben außerhalb von Git.

Ein stark gekürzter Ausschnitt aus dem Playbook:

```yaml
- name: Prepare blog staging K3s node
  hosts: k3s_servers
  become: true

  tasks:
    - name: Create K3s configuration directory
      ansible.builtin.file:
        path: /etc/rancher/k3s
        state: directory
        owner: root
        group: root
        mode: "0755"

    - name: Configure K3s
      ansible.builtin.copy:
        dest: /etc/rancher/k3s/config.yaml
        owner: root
        group: root
        mode: "0600"
        content: |
          write-kubeconfig-mode: "0640"
          secrets-encryption: true
          disable:
            - traefik
            - servicelb
```

Zwei Entscheidungen sind hier absichtlich anders als bei einer Standard-K3s-Installation.

### Secrets at Rest

K3s wird mit

```yaml
secrets-encryption: true
```

gestartet.

Damit liegen Kubernetes Secrets nicht einfach unverschlüsselt im Datastore.

### Traefik und ServiceLB aus

K3s bringt standardmäßig Traefik und ServiceLB mit.

Für dieses Setup brauche ich beides zunächst nicht.

Der Blog soll ausschließlich über einen Cloudflare Tunnel erreichbar werden. Es gibt deshalb keinen Grund, jetzt schon einen Ingress Controller oder einen LoadBalancer-Service zu betreiben.

```text
Kein Ingress
Kein NodePort
Kein LoadBalancer
Kein Portforwarding
```

Das hält den ersten Cluster bewusst klein.

## Erster Ansible-Lauf

Bevor das Playbook läuft, prüfe ich die SSH-Verbindung:

```bash
ansible all -m ping
```

Erwartet:

```text
k3s-blog-01 | SUCCESS => {
    "changed": false,
    "ping": "pong"
}
```

Danach:

```bash
ansible-playbook playbooks/k3s.yml --syntax-check
ansible-playbook playbooks/k3s.yml
```

Der erste erfolgreiche Lauf endete bei mir mit:

```text
PLAY RECAP
k3s-blog-01 : ok=10 changed=7 unreachable=0 failed=0
```

Und damit war aus einer normalen Debian-VM ein Kubernetes-Node geworden.

## Ist der Node wirklich Ready?

Ein laufender `k3s.service` reicht mir als Prüfung nicht.

Ich will sehen, ob Kubernetes den Node selbst als bereit betrachtet:

```bash
sudo k3s kubectl get nodes -o wide
```

Bei meinem ersten Aufbau sah das so aus:

```text
NAME          STATUS   ROLES           VERSION
k3s-blog-01   Ready    control-plane   v1.36.4+k3s1
```

Danach die System-Pods:

```bash
sudo k3s kubectl get pods -A -o wide
```

Entscheidend waren für diesen Stand:

```text
coredns                  Running
local-path-provisioner   Running
metrics-server           Running
```

Direkt nach dem ersten Start hatte der Metrics Server kurz noch keine Endpoints. Das hat sich während des Cluster-Starts von selbst erledigt.

Der wichtige Punkt ist nicht, ob in den ersten Sekunden irgendwo eine Warnung auftaucht, sondern ob sich der Cluster anschließend in einen stabilen Zustand bewegt.

## Was soll im Cluster laufen?

Mein Blog besteht für Staging zunächst aus zwei eigenen Workloads:

```text
blog-staging Namespace
│
├── Deployment: blog
│   └── Service: blog :80
│
└── Deployment: search
    └── Service: search :8090
```

Dazu kommt `cloudflared` separat:

```text
cloudflare Namespace
└── Deployment: cloudflared
```

Die Trennung gefällt mir, weil der Tunnel damit nicht einfach Bestandteil des Blog-Containers ist.

Der Blog kennt Cloudflare nicht. Cloudflare kennt den Blog nur über den Kubernetes-Service.

## Private Images aus GHCR ziehen

Die Images liegen in GHCR und das Repository ist privat.

Der Node braucht deshalb Credentials, um die Images ziehen zu dürfen.

Für den ersten Bootstrap habe ich ein Docker Registry Secret erzeugt:

```bash
kubectl -n blog-staging create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<github-user> \
  --docker-password="$GHCR_TOKEN"
```

Im Deployment wird dieses Secret referenziert:

```yaml
spec:
  imagePullSecrets:
    - name: ghcr-pull
```

Wichtig: Der Token gehört **nicht** ins Repository und auch nicht in ein Manifest.

Für den Bootstrap reicht dieses Verfahren. Die saubere langfristige Secret-Verwaltung ist ein eigenes Thema und gehört ebenfalls eher in den GitOps-Teil.

## Blog und Search deployen

Die Anwendung liegt unter:

```text
infra/kubernetes/staging/
├── blog.yaml
├── cloudflared.yaml
└── kustomization.yaml
```

Der Blog-Service ist ein ganz normaler interner `ClusterIP`-Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: blog
  namespace: blog-staging
spec:
  selector:
    app: blog
  ports:
    - name: http
      port: 80
      targetPort: http
```

Der Search-Service genauso:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: search
  namespace: blog-staging
spec:
  selector:
    app: search
  ports:
    - name: http
      port: 8090
      targetPort: http
```

Der Blog spricht den Search-Service nicht über IP-Adressen an, sondern über Kubernetes DNS:

```text
http://search:8090/search
```

Das ist einer dieser kleinen Momente, in denen Kubernetes plötzlich angenehm wird: Die Anwendung muss nicht wissen, auf welchem Pod oder auf welcher IP der Search-Service gerade läuft.

## Erst intern testen

Bevor Cloudflare überhaupt ins Spiel kommt, muss der Service innerhalb des Clusters funktionieren.

Zuerst direkt gegen die ClusterIP:

```bash
BLOG_IP=$(sudo k3s kubectl -n blog-staging \
  get svc blog \
  -o jsonpath='{.spec.clusterIP}')

curl -fsS "http://${BLOG_IP}/healthz"
```

Antwort:

```text
ok
```

Danach aus einem temporären Pod:

```bash
sudo k3s kubectl -n blog-staging run curl-test \
  --image=curlimages/curl \
  --restart=Never \
  --attach \
  --rm \
  -- curl -fsS http://blog/healthz
```

Wieder:

```text
ok
```

Damit waren gleichzeitig mehrere Dinge geprüft:

```text
Pod läuft                 ✓
Service Routing           ✓
Kubernetes DNS            ✓
HTTP Health Endpoint      ✓
```

Erst jetzt lohnt es sich, die nächste Schicht davorzusetzen.

## Der erste kleine Stolperstein: Search Cold Start

Der Search-Container war beim ersten Start kurz `Running`, aber noch nicht `Ready` und hatte einen Restart.

Der Grund war nicht unbedingt ein echter Crash der Anwendung. Der Container muss beim ersten Start unter anderem sein Modell initialisieren und kann damit länger brauchen als ein kleiner Webserver.

Eine klassische Liveness Probe ist dafür schnell zu aggressiv.

Die saubere Lösung ist eine `startupProbe`.

Solange diese noch nicht erfolgreich ist, lässt Kubernetes die normale Liveness Probe in Ruhe.

Das ist ein gutes Beispiel dafür, warum Healthchecks nicht nur vorhanden sein sollten, sondern zum tatsächlichen Startverhalten der Anwendung passen müssen.

## Cloudflare Tunnel direkt im Cluster

Für den externen Zugriff wollte ich weiterhin keine offenen Ports.

Also läuft `cloudflared` direkt als Deployment im Cluster.

```text
cloudflare Namespace
└── cloudflared Pod
       │
       │ ausgehende QUIC-Verbindung
       ▼
   Cloudflare Edge
```

Der Tunnel bekommt sein Token über ein Kubernetes Secret:

```bash
kubectl -n cloudflare create secret generic cloudflared-token \
  --from-literal=token="$CLOUDFLARE_TUNNEL_TOKEN"
```

Im Deployment landet nur die Referenz:

```yaml
env:
  - name: TUNNEL_TOKEN
    valueFrom:
      secretKeyRef:
        name: cloudflared-token
        key: token
```

Danach baut `cloudflared` selbst die Verbindung nach außen auf.

Es gibt weiterhin keinerlei eingehende Verbindung zum Kubernetes-Node.

## Tunnel zuerst intern gegen den Blog testen

Bevor ich DNS anfasse, teste ich aus dem `cloudflare`-Namespace, ob der Tunnel-Pod den Blog überhaupt über Cluster-DNS erreichen kann:

```bash
sudo k3s kubectl -n cloudflare run curl-test \
  --image=curlimages/curl \
  --restart=Never \
  --attach \
  --rm \
  -- curl -fsS http://blog.blog-staging.svc.cluster.local/healthz
```

Antwort:

```text
ok
```

Damit steht die interne Kette:

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

Im Cloudflare Tunnel wird anschließend ein Public Hostname auf den internen Kubernetes-Service gelegt.

Der Origin ist dabei **keine Node-IP** und kein NodePort, sondern direkt der Service-DNS-Name:

```text
http://blog.blog-staging.svc.cluster.local:80
```

Damit sieht die komplette Kette so aus:

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

## Der zweite Stolperstein: DNS war da, TLS trotzdem kaputt

Mein erster Hostname war:

```text
staging.blog.obivan.org
```

DNS war irgendwann sauber vorhanden:

```bash
dig +short staging.blog.obivan.org @1.1.1.1
```

und lieferte Cloudflare-Adressen zurück.

Trotzdem endete der HTTPS-Test mit:

```text
TLS connect error: ssl/tls alert handshake failure
```

Der Grund war die Zertifikatsabdeckung.

Ein Universal-SSL-Zertifikat für `obivan.org` deckt typischerweise `*.obivan.org` ab, aber nicht automatisch eine weitere Ebene wie:

```text
staging.blog.obivan.org
```

Für dieses Staging wollte ich daraus kein eigenes Zertifikatsprojekt machen.

Also wurde aus:

```text
staging.blog.obivan.org
```

schlicht:

```text
staging-blog.obivan.org
```

DNS erneut prüfen:

```bash
dig +short staging-blog.obivan.org @1.1.1.1
```

und anschließend:

```bash
curl -I https://staging-blog.obivan.org
```

Diesmal kam das, worauf ich gewartet hatte:

```text
HTTP/2 200
server: cloudflare
```

Und der eigentliche Healthcheck:

```bash
curl -fsS https://staging-blog.obivan.org/healthz
```

lieferte:

```text
ok
```

Damit war der Blog das erste Mal aus meinem K3s-Cluster heraus öffentlich erreichbar.

## Was damit tatsächlich getestet ist

Ein `HTTP 200` wirkt wie ein kleiner Endpunkt-Test, bestätigt hier aber eine ganze Menge Infrastruktur auf einmal:

```text
Debian VM                  ✓
QEMU Guest Agent           ✓
Ansible Bootstrap          ✓
K3s Control Plane          ✓
Flannel / CNI              ✓
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

Und weiterhin:

```text
Öffentliche Node-IP        ✗
Router-Portfreigabe        ✗
NodePort                   ✗
LoadBalancer               ✗
Ingress Controller         ✗
```

Genau so wollte ich die erste Ausbaustufe haben.

## Was noch bewusst provisorisch ist

Part 1 ist funktional, aber noch kein fertiger GitOps-Betrieb.

Ein paar Dinge sind absichtlich noch einfach gehalten:

- ein einzelner K3s-Node
- Search-Cache noch ohne Persistent Volume
- Registry Secret manuell erzeugt
- Cloudflare Tunnel Secret manuell erzeugt
- Bootstrap und erste Deployments manuell angestoßen
- Images zunächst per Manifest gesetzt
- Proxmox-Host temporär als Ansible-/Admin-Controller benutzt

Das ist kein Versehen.

Ich wollte zuerst eine vollständige, verständliche Kette zum Laufen bekommen und **danach** die Automatisierung darüberlegen.

## Zwischenstand

Der wichtige Punkt nach Part 1 ist:

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

Die Anwendung läuft damit wirklich im Homelab und ist von außen erreichbar, ohne dass ich dafür mein internes Netz direkt öffnen musste.

Für mich ist das die sinnvollere Reihenfolge als sofort mit GitOps, HA, Ingress, Cert-Manager und zehn weiteren Komponenten zu starten.

Erst muss die einfache Kette funktionieren.

Dann darf sie automatisch werden.

---

## Fortsetzung in Part 2

**Part 1 endet genau hier.**

Ab Part 2 geht es nicht mehr darum, den Cluster grundsätzlich erreichbar zu bekommen, sondern darum, den manuellen Deployment-Pfad wieder loszuwerden.

Dort geht es weiter mit:

```text
Flux Bootstrap
      ↓
Git als Desired State
      ↓
Kustomize Reconciliation
      ↓
immutable SHA Images
      ↓
automatische Updates
      ↓
kein manueller kubectl-Deploy mehr
```

Außerdem möchte ich dort klären, wie der Cluster sicher auf das private GitHub-Repository zugreift, wie Image-Versionen automatisiert aktualisiert werden und wie der Proxmox-Host wieder aus dem eigentlichen Deployment-Prozess verschwindet.

<!-- PART-2-START: Flux/GitOps ab hier fortsetzen -->

## Querverweise

- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[docker-vs-docker-compose|Docker vs. Docker Compose]]

## Quellen

- [Cloudflare Tunnel](/sources.html#cloudflare-tunnel)
