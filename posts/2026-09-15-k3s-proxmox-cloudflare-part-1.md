---
id: 2026-09-15-k3s-proxmox-cloudflare-part-1
version: 6
title: 'K3s auf Proxmox – Teil I: Blog-Staging mit Cloudflare Tunnel'
status: publish
date: 2026-09-15T00:00:00.000Z
created_at: 2026-09-15T00:00:00.000Z
updated_at: 2026-09-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Praxisanleitung vom Proxmox-VM-Setup bis zum öffentlichen K3s-Service: Debian
  13, Ansible, private GHCR Images, ClusterIP Services, Healthchecks und
  Cloudflare Tunnel ohne Portfreigabe.
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
  - query: >-
      Wie installiere ich K3s auf einer Proxmox VM und veröffentliche einen
      Service über Cloudflare Tunnel?
    maxRank: 1
  - query: Wie betreibe ich Kubernetes im Homelab ohne Portfreigabe am Router?
    maxRank: 1
  - query: Wie ziehe ich private GHCR Images in K3s?
    maxRank: 1
snippets:
  - file: 01-k3s-ansible-bootstrap.yml
    title: K3s-Node mit Ansible bootstrappen
    description: >-
      Installiert Basis-Pakete, aktiviert den QEMU Guest Agent und konfiguriert
      K3s ohne Traefik und ServiceLB.
    type: Ansible-Playbook
    language: yaml
  - file: 02-ghcr-pull-secret.sh
    title: GHCR Pull Secret für den Staging-Namespace
    description: >-
      Erzeugt ein Docker-Registry-Secret für private GHCR Images, ohne
      Credentials in Git abzulegen.
    type: Shellskript
    language: bash
  - file: 03-blog-search-services.yml
    title: Interne ClusterIP-Services für Blog und Search
    description: >-
      Definiert die internen Kubernetes Services, über die Blog und Search
      miteinander sprechen.
    type: Kubernetes-Manifest
    language: yaml
  - file: 04-internal-healthchecks.sh
    title: Blog intern per ClusterIP und Kubernetes DNS testen
    description: >-
      Prüft den Blog zuerst direkt über die ClusterIP und anschließend aus einem
      temporären Pod.
    type: Shellskript
    language: bash
  - file: 05-cloudflared-deployment.yml
    title: cloudflared als Deployment im Cluster
    description: Startet cloudflared mit einem Tunnel-Token aus einem Kubernetes Secret.
    type: Kubernetes-Manifest
    language: yaml
  - file: 06-cross-namespace-healthcheck.sh
    title: Cloudflare-Namespace gegen den Blog-Service testen
    description: >-
      Prüft die Erreichbarkeit des Blog-Service über den vollständigen
      Kubernetes DNS-Namen.
    type: Shellskript
    language: bash
cover_query: server datacenter infrastructure network cloud container cluster kubernetes
cover_provider: pixabay
cover_provider_id: '2402637'
cover_image: /assets/covers/2026-09-15-k3s-proxmox-cloudflare-part-1.jpg
cover_alt: >-
  network, server, system, infrastructure, managed services, connection,
  computer, cloud, gray computer, gray laptop, network, network, server, server,
  server, server, server
cover_focus: center
cover_credit: by bsdrouin via Pixabay
cover_credit_url: 'https://pixabay.com/photos/network-server-system-2402637/'
cover_source_url: 'https://pixabay.com/photos/network-server-system-2402637/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 68
---

Mein produktiver Blog bleibt vorerst auf Hetzner und Docker Compose. In diesem Teil geht es deshalb nicht darum, Produktion möglichst schnell auf Kubernetes umzuziehen, sondern um einen reproduzierbaren Weg von **einer normalen Container-Anwendung zu einem funktionierenden K3s-Staging auf Proxmox**.

Bevor ich loslege, vier Begriffe, die ich im Rest des Artikels benutze:

| Begriff | Was ich damit meine |
| --- | --- |
| **K3s** | Eine schlanke Kubernetes-Distribution. Sie bringt die wichtigsten Kubernetes-Komponenten in einem Paket mit und eignet sich gut für kleine Cluster und Homelabs. |
| **ClusterIP** | Ein Kubernetes-Service, der nur **innerhalb** des Clusters erreichbar ist. Genau das nutze ich für Blog und Suche. |
| **Kernel Grep / Search** | Mein eigener Suchdienst für den Blog. Blog und Suche laufen als getrennte Container. |
| **Bootstrap** | Die einmalige Ersteinrichtung eines Systems. In meinem Fall: VM vorbereiten, K3s installieren und die Grundkonfiguration setzen. |


Ist bereits ein Docker-Image der Anwendung vorhanden, lässt sich der Ablauf weitgehend übernehmen. Im Wesentlichen müssen nur Image, Container-Port, Healthcheck und Domain an den jeweiligen Stack angepasst werden.

## Ziel, Architektur und Stand

Mein Ziel in Teil I ist bewusst klein: **Staging soll laufen, intern sauber erreichbar sein und von außen über Cloudflare funktionieren – ohne Production umzuziehen.**

![Architektur Teil I: Proxmox, K3s, Blog, Kernel Grep und Cloudflare Tunnel](/assets/posts/k3s-proxmox-series/teil-i-architektur.svg)

Die Arbeit lässt sich in sechs Schritte teilen:

| Schritt | Ziel | Stand |
| --- | --- | --- |
| 1. VM | Debian 13 auf Proxmox als saubere Basis | erledigt |
| 2. K3s | schlanker Single-Node ohne unnötige öffentliche Dienste | erledigt |
| 3. Registry | private GHCR-Images aus K3s ziehen | erledigt |
| 4. Blog + Search | beide Services nur intern über ClusterIP betreiben | erledigt |
| 5. interne Tests | DNS, Service und Healthcheck vor Cloudflare prüfen | erledigt |
| 6. Cloudflare Tunnel | Staging outbound-only öffentlich erreichbar machen | erledigt |

### Was am Ende von Teil I noch offen ist

Wichtig: Das ist der Stand **am Ende dieses Teils**. Dinge aus Teil II oder III markiere ich hier nicht rückwirkend als erledigt.

- [ ] Staging im Browser eindeutig markieren.
- [ ] Deployments über Git statt über manuelle `kubectl`-Schritte steuern.
- [ ] Einen getesteten Staging-Stand kontrolliert Richtung Production weitergeben.
- [ ] Secrets sauber verwalten.
- [ ] Backup und Restore planen und testen.
- [ ] Monitoring ergänzen.

Am Ende läuft diese Kette:

```text
GHCR / Container Registry
        ↓
Debian VM auf Proxmox
        ↓
K3s
        ↓
Deployment → ClusterIP Service
        ↓
cloudflared
        ↓
Cloudflare Tunnel
        ↓
staging-blog.obivan.org
```

Dabei braucht der Kubernetes-Node weder eine öffentliche IP noch einen NodePort, LoadBalancer oder eine Portfreigabe am Router.

## Voraussetzungen

Für den Nachbau reichen wenige Bausteine:

| Baustein | In meinem Setup | Übertragbares Setup |
| --- | --- | --- |
| Hypervisor | Proxmox VE | Proxmox oder vorhandene Linux-VM |
| VM | Debian 13, 2 vCPU, 4 GB RAM, 32 GB | für kleine Stacks ähnlich ausreichend |
| Kubernetes | K3s | K3s Single Node |
| Registry | GHCR privat | GHCR oder andere OCI Registry |
| Anwendung | Blog + Search | beliebiges Container-Image |
| Healthcheck | `/healthz` | eigener HTTP-Endpunkt empfohlen |
| Externer Zugriff | Cloudflare Tunnel | Cloudflare Tunnel |
| Admin-Zugriff | SSH + Ansible | SSH reicht, Ansible macht es reproduzierbar |

Mein K3s-Node heißt `k3s-blog-01`. Die konkrete interne IP ist für das Konzept egal; wichtig ist nur, dass der Admin-Rechner den Node per SSH und später auf TCP 6443 erreichen kann.

## 1. Debian-VM in Proxmox anlegen

Ich nutze eine Debian-13-Cloud-Image-VM mit diesen Ressourcen:

```text
Name:       k3s-blog-01
vCPU:       2
RAM:        4096 MB
Disk:       32 GB
Netzwerk:   internes Service-Netz
Public IP:  keine
```

Das lässt sich über die Proxmox-Oberfläche bauen. Wer lieber reproduzierbar arbeitet, kann die VM auch per `qm` vorbereiten. Beispiel mit Platzhaltern:

```bash
VMID=105
VM_NAME=k3s-blog-01
STORAGE=local-zfs
BRIDGE=vmbr1_serv
IMAGE=/var/lib/vz/template/iso/debian-13-generic-amd64.qcow2

qm create "$VMID" \
  --name "$VM_NAME" \
  --cores 2 \
  --memory 4096 \
  --net0 "virtio,bridge=${BRIDGE}" \
  --scsihw virtio-scsi-single

qm disk import "$VMID" "$IMAGE" "$STORAGE"
qm config "$VMID" | grep '^unused'
```

Der Import erscheint danach als `unused0`. Der ausgegebene Storage-Identifier wird anschließend als Boot-Disk eingebunden, zum Beispiel:

```bash
qm set "$VMID" --scsi0 local-zfs:vm-105-disk-0
qm set "$VMID" --ide2 "${STORAGE}:cloudinit"
qm set "$VMID" --boot order=scsi0
qm set "$VMID" --serial0 socket --vga serial0
qm set "$VMID" --agent enabled=1
qm set "$VMID" --ciuser obivan
qm set "$VMID" --sshkeys ~/.ssh/id_ed25519.pub
qm set "$VMID" --ipconfig0 ip=dhcp
qm start "$VMID"
```

Der Name des importierten Volumes kann je nach Storage abweichen. Deshalb nicht blind `vm-105-disk-0` übernehmen, sondern vorher die Ausgabe von `qm config` prüfen.

Nach dem Boot muss zuerst nur SSH funktionieren:

```bash
ssh obivan@<VM-IP>
```

Für meinen Ansible-Bootstrap – also die automatisierte Ersteinrichtung mit Ansible – kann der Benutzer außerdem `sudo` ohne interaktive Passworteingabe verwenden:

```bash
sudo -n true
```

Wenn dieser Befehl ohne Ausgabe und Fehler endet, ist die VM bereit.

## 2. K3s reproduzierbar mit Ansible installieren

Der Bootstrap liegt bei mir unter `infra/ansible/`. Das Inventory ist absichtlich nicht mit der echten internen IP eingecheckt.

```bash
cd infra/ansible
cp inventory/staging/hosts.yml.example inventory/staging/hosts.yml
```

Danach wird nur die Adresse angepasst:

```yaml
all:
  children:
    k3s_servers:
      hosts:
        k3s-blog-01:
          ansible_host: 192.0.2.10
          ansible_user: obivan
```

`192.0.2.10` ist hier nur ein Dokumentationswert. Dort gehört die echte IP oder ein interner DNS-Name hinein.

Bevor irgendetwas installiert wird, teste ich Ansible und SSH:

```bash
ansible all -m ping
```

Erwartet wird:

```text
pong
```

Dann Syntax prüfen und den Bootstrap ausführen:

```bash
ansible-playbook playbooks/k3s.yml --syntax-check
ansible-playbook playbooks/k3s.yml
```

Das vollständige Beispiel liegt hier:

[K3s-Node mit Ansible bootstrappen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/01-k3s-ansible-bootstrap.yml "snippet:yaml")

Wesentlich sind in meinem K3s-Setup diese Einstellungen:

```yaml
write-kubeconfig-mode: "0640"
secrets-encryption: true
disable:
  - traefik
  - servicelb
```

Traefik und ServiceLB sind hier nicht defekt oder unerwünscht. Ich brauche sie schlicht nicht, weil der externe HTTP-Pfad später vollständig über `cloudflared` läuft.

## 3. Prüfen, ob Kubernetes wirklich funktioniert

Ein laufender `k3s.service` reicht nicht. Der Node muss aus Kubernetes-Sicht `Ready` sein:

```bash
sudo k3s kubectl get nodes -o wide
```

Erwartet wird ungefähr:

```text
NAME          STATUS   ROLES           VERSION
k3s-blog-01   Ready    control-plane   v1.x.x+k3s1
```

Danach die System-Pods prüfen:

```bash
sudo k3s kubectl get pods -A
```

Mindestens CoreDNS und die übrigen benötigten K3s-Systemkomponenten sollten `Running` sein.

Weil Secrets Encryption aktiviert wurde, prüfe ich auch diesen Zustand explizit:

```bash
sudo k3s secrets-encrypt status
```

Der relevante Teil ist:

```text
Encryption Status: Enabled
```

Damit steht die Kubernetes-Basis.

## 4. Optional: Kubeconfig auf den Admin-Rechner holen

Alle weiteren Befehle können direkt auf dem Node mit `sudo k3s kubectl` ausgeführt werden. Bequemer ist ein normales `kubectl` auf dem Admin-Rechner.

Dort lege ich zuerst das Ziel an:

```bash
mkdir -p ~/.kube
ssh obivan@<VM-IP> 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  > ~/.kube/k3s-blog-01.yaml
chmod 600 ~/.kube/k3s-blog-01.yaml
```

In der Datei zeigt der API-Server zunächst auf `127.0.0.1`. Das muss durch die interne Adresse des K3s-Nodes ersetzt werden:

```yaml
server: https://<VM-IP>:6443
```

Dann testen:

```bash
export KUBECONFIG=~/.kube/k3s-blog-01.yaml
kubectl get nodes
```

Wenn hier wieder `Ready` erscheint, können die restlichen Schritte vom Admin-Rechner aus erfolgen.

## 5. Namespace und Registry-Zugriff vorbereiten

Meine Anwendung läuft im Namespace `blog-staging`:

```bash
kubectl create namespace blog-staging
```

Für öffentliche Images wäre damit schon genug vorbereitet. Meine Images liegen jedoch privat in GHCR, also braucht Kubernetes ein Pull-Secret.

```bash
read -s GHCR_TOKEN
export GHCR_TOKEN

kubectl -n blog-staging create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<GITHUB-USER> \
  --docker-password="$GHCR_TOKEN"

unset GHCR_TOKEN
```

Das gleiche als wiederverwendbares Snippet:

[GHCR Pull Secret für den Staging-Namespace](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/02-ghcr-pull-secret.sh "snippet:bash")

Prüfen:

```bash
kubectl -n blog-staging get secret ghcr-pull
```

Der Token selbst gehört nicht in Git und nicht als Klartext in ein Manifest.

## 6. Aus einem Container wird Deployment + Service

Für eine einfache Docker-Anwendung sind zunächst zwei Kubernetes-Ressourcen entscheidend:

```text
Deployment
  hält den Container am Laufen

Service
  gibt den Pods eine stabile interne Adresse
```

Ein minimales Beispiel für einen HTTP-Service sieht so aus:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: blog-staging
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      imagePullSecrets:
        - name: ghcr-pull
      containers:
        - name: app
          image: ghcr.io/OWNER/APP:GIT_SHA
          ports:
            - name: http
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 15
---
apiVersion: v1
kind: Service
metadata:
  name: app
  namespace: blog-staging
spec:
  selector:
    app: app
  ports:
    - name: http
      port: 80
      targetPort: http
```

Die vier Werte, die in fast jedem Setup angepasst werden müssen, sind `image`, `containerPort`, der Healthcheck-Pfad und der Service-Port.

Für meinen Blog kommt noch der Search-Service dazu. Beide bleiben reine `ClusterIP`-Services:

[Interne ClusterIP-Services für Blog und Search](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/03-blog-search-services.yml "snippet:yaml")

Der Blog erreicht Search im selben Namespace über:

```text
http://search:8090/search
```

Das ist der wichtige Unterschied zu Docker-Setups mit fest verdrahteten IPs: Pods dürfen wechseln. Der Service-Name bleibt.

## 7. Manifeste anwenden und Rollout beobachten

In meinem Repository liegen die Staging-Manifeste unter:

```text
infra/kubernetes/staging/
├── blog.yaml
├── cloudflared.yaml
└── kustomization.yaml
```

Noch ohne Flux kann dieser Stand ganz normal manuell angewendet werden:

```bash
kubectl apply -k infra/kubernetes/staging
```

Danach nicht sofort den Browser öffnen, sondern zuerst den Rollout prüfen:

```bash
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/blog
kubectl -n blog-staging get pods,svc -o wide
```

Bei Problemen sind diese drei Befehle meistens der schnellste Einstieg:

```bash
kubectl -n blog-staging describe pod <POD>
kubectl -n blog-staging logs <POD>
kubectl -n blog-staging get events --sort-by=.lastTimestamp
```

Typische Fehler lassen sich damit sofort einer Schicht zuordnen: Registry-Zugriff, Container-Start, Probe, fehlende Umgebungsvariable oder Ressourcenlimit.

## 8. Die Anwendung zuerst intern testen

Cloudflare kommt erst dazu, wenn Kubernetes intern sauber funktioniert.

Zuerst prüfe ich den Blog direkt über seine ClusterIP und anschließend aus einem temporären Pod über Kubernetes DNS:

[Blog intern per ClusterIP und Kubernetes DNS testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/04-internal-healthchecks.sh "snippet:bash")

Der entscheidende Test ist konzeptionell dieser:

```bash
kubectl -n blog-staging run curl-test \
  --image=curlimages/curl \
  --restart=Never \
  --attach \
  --rm \
  -- curl -fsS http://blog/healthz
```

Erwartet wird:

```text
ok
```

Damit sind bereits Container, Service-Selector, Cluster-Netzwerk, CoreDNS und HTTP-Healthcheck geprüft.

Wenn das nicht funktioniert, bringt es nichts, gleichzeitig DNS bei Cloudflare oder TLS zu debuggen.

## 9. Probes müssen zum Startverhalten passen

Mein Search-Container benötigt beim ersten Start deutlich länger als der kleine Blog-Webserver. Unter anderem werden Modell und Daten initialisiert.

Dafür verwende ich zusätzlich eine `startupProbe`:

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: http
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 36
```

Erst wenn diese Startphase erfolgreich war, übernehmen Readiness- und Liveness-Probe ihre normalen Aufgaben.

Beim ersten Aufbau hatte Search einmal einen Restart. Aus diesem einzelnen Ereignis ließ sich die konkrete Ursache nicht sauber bestimmen. Die `startupProbe` ist deshalb keine rückwirkende Erklärung dieses Restarts, sondern eine saubere Abbildung des tatsächlich längeren Startverhaltens.

## 10. Cloudflare Tunnel in Kubernetes starten

Jetzt kommt der öffentliche Zugriff dazu. Dafür nutze ich einen bereits in Cloudflare angelegten Tunnel.

Zuerst Namespace und Secret:

```bash
kubectl create namespace cloudflare

read -s CLOUDFLARE_TUNNEL_TOKEN
export CLOUDFLARE_TUNNEL_TOKEN

kubectl -n cloudflare create secret generic cloudflared-token \
  --from-literal=token="$CLOUDFLARE_TUNNEL_TOKEN"

unset CLOUDFLARE_TUNNEL_TOKEN
```

Das Deployment liest nur die Secret-Referenz:

[cloudflared als Deployment im Cluster](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/05-cloudflared-deployment.yml "snippet:yaml")

Danach:

```bash
kubectl apply -k infra/kubernetes/staging
kubectl -n cloudflare rollout status deployment/cloudflared
kubectl -n cloudflare get pods
```

Der Tunnel baut die Verbindung **aus dem Cluster nach außen** auf. Deshalb muss für diesen HTTP-Pfad kein Port 80 oder 443 zum K3s-Node weitergeleitet werden.

## 11. Vor Cloudflare den Cross-Namespace-Pfad testen

`cloudflared` läuft bei mir im Namespace `cloudflare`, der Blog in `blog-staging`. Deshalb teste ich genau den DNS-Namen, den später auch der Tunnel verwendet:

```text
blog.blog-staging.svc.cluster.local
```

Der Test dazu:

[Cloudflare-Namespace gegen den Blog-Service testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/06-cross-namespace-healthcheck.sh "snippet:bash")

Erwartet wird wieder:

```text
ok
```

Wenn dieser Test funktioniert, steht der interne Pfad:

```text
cloudflared Pod
      ↓
CoreDNS
      ↓
blog.blog-staging.svc.cluster.local
      ↓
Service
      ↓
Blog Pod
```

## 12. Public Hostname im Tunnel setzen

In Cloudflare zeigt mein Public Hostname auf diesen Origin:

```text
Hostname:
staging-blog.obivan.org

Service:
http://blog.blog-staging.svc.cluster.local:80
```

Damit ist kein Ingress Controller nötig. `cloudflared` kann den internen Service direkt per Kubernetes DNS erreichen.

Der vollständige Request-Pfad ist damit:

```text
Browser
  ↓
Cloudflare Edge
  ↓
Tunnel
  ↓
cloudflared Pod
  ↓
blog.blog-staging.svc.cluster.local:80
  ↓
Blog Service
  ↓
Blog Pod :8080
```

## 13. Von außen testen

Zuerst DNS:

```bash
dig +short staging-blog.obivan.org @1.1.1.1
```

Dann HTTP und Healthcheck:

```bash
curl -I https://staging-blog.obivan.org
curl -fsS https://staging-blog.obivan.org/healthz
```

Erwartet werden:

```text
HTTP/2 200
```

und:

```text
ok
```

Ich hatte zunächst `staging.blog.obivan.org` verwendet. DNS funktionierte, TLS jedoch nicht wie erwartet. Der praktische Unterschied: Ein Zertifikat für `*.obivan.org` deckt `staging-blog.obivan.org`, aber nicht automatisch die zusätzliche Ebene `staging.blog.obivan.org` ab. Für mein Setup war der flachere Hostname deshalb die pragmatische Lösung.

## 14. Docker-Compose-Service auf Kubernetes übertragen

Für die Migration eines anderen Stacks ist diese Zuordnung nützlicher als jedes vollständige Copy-and-Paste-Manifest:

| Docker / Compose | Kubernetes |
| --- | --- |
| `image:` | Container im `Deployment` |
| `ports:` nur intern | `Service` vom Typ `ClusterIP` |
| öffentliche Portfreigabe | hier: Cloudflare Tunnel statt NodePort |
| `environment:` | `env`, später ggf. ConfigMap/Secret |
| `depends_on:` | nicht als Startreihenfolge nachbauen; Services müssen Retries vertragen |
| Docker Healthcheck | `startupProbe`, `readinessProbe`, `livenessProbe` |
| Containername als DNS | Kubernetes Service-Name |
| bind mount / volume | je nach Bedarf PVC, CSI oder bewusst ephemeral |
| private Registry Login | `imagePullSecrets` |
| `restart: unless-stopped` | Deployment hält gewünschte Replica-Zahl |

Für die erste Migration würde ich **einen Service nach dem anderen** umziehen: erst Deployment + ClusterIP, intern testen, dann Abhängigkeiten, zuletzt den externen Zugriff.

## 15. Fehler systematisch von innen nach außen suchen

Wenn die öffentliche URL nicht funktioniert, prüfe ich nicht alles gleichzeitig, sondern diese Reihenfolge:

```bash
# 1. Läuft der Pod?
kubectl -n blog-staging get pods

# 2. Warum läuft er nicht oder wird nicht Ready?
kubectl -n blog-staging describe pod <POD>
kubectl -n blog-staging logs <POD>

# 3. Hat der Service Endpoints?
kubectl -n blog-staging get svc,endpoints

# 4. Funktioniert Service-DNS aus einem Pod?
kubectl -n blog-staging run curl-test \
  --image=curlimages/curl \
  --restart=Never --attach --rm -- \
  curl -fsS http://blog/healthz

# 5. Erreicht der cloudflared-Namespace den Blog?
kubectl -n cloudflare run curl-test \
  --image=curlimages/curl \
  --restart=Never --attach --rm -- \
  curl -fsS http://blog.blog-staging.svc.cluster.local/healthz

# 6. Ist der Tunnel gesund?
kubectl -n cloudflare logs deployment/cloudflared

# 7. Erst jetzt extern testen
curl -v https://staging-blog.obivan.org/healthz
```

Damit ist schnell sichtbar, ob der Fehler im Container, in Kubernetes, im Tunnel oder erst davor bei DNS/TLS liegt.

## Was nach Teil I funktioniert

Der Stand ist jetzt bewusst einfach, aber vollständig nutzbar:

```text
Debian VM                  ✓
K3s Node Ready             ✓
Secrets Encryption         ✓
private Registry           ✓
Deployment                 ✓
ClusterIP Service          ✓
Kubernetes DNS             ✓
Health Probes              ✓
Cloudflare Tunnel          ✓
Public DNS + TLS           ✓
Externer Healthcheck       ✓

Öffentliche Node-IP        nicht nötig
Router-Portfreigabe        nicht nötig
NodePort                   nicht nötig
LoadBalancer               nicht nötig
Ingress Controller         nicht nötig
```

Noch bewusst provisorisch sind der einzelne K3s-Node, manuell angelegte Secrets, temporäre Search-Daten auf `emptyDir` und der manuell angestoßene Deployment-Pfad.

Das ist die Grenze von Teil I: **Die Anwendung läuft reproduzierbar auf Kubernetes und ist sauber testbar.**

## Ausblick auf Teil II

Teil II automatisiert genau diesen funktionierenden Pfad. Dort kommen der `staging`-Branch, eindeutig einem Git-Commit zugeordnete Container-Images, Kustomize und Flux dazu. Die Begriffe führe ich dort Schritt für Schritt ein.

Der Ablauf wird dann:

```text
PR nach staging
      ↓
GitHub Actions baut Images
      ↓
Git schreibt gewünschte SHA-Pins
      ↓
Flux reconciliert
      ↓
öffentlicher Smoke-Test
      ↓
Promotion-PR nach main
```

Production bleibt dabei weiterhin bewusst ein manueller Merge.

## Querverweise

- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[docker-vs-docker-compose|Docker vs. Docker Compose]]
