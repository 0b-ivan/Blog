---
id: 2026-09-15-k3s-proxmox-cloudflare-part-1
version: 5
title: "K3s auf Proxmox – Teil I: Blog-Staging mit Cloudflare Tunnel"
status: publish
date: 2026-09-15
created_at: 2026-09-15
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Praxisanleitung vom Proxmox-VM-Setup bis zum öffentlichen K3s-Service: Debian 13, Ansible, private GHCR Images, ClusterIP Services, Healthchecks und Cloudflare Tunnel ohne Portfreigabe."
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
  - file: "07-proxmox-vm-bootstrap.sh"
    title: "Debian-VM für K3s mit qm vorbereiten"
    description: "Erstellt die Proxmox-VM, importiert die Cloud-Image-Disk und setzt Cloud-Init, Netzwerk und Boot-Konfiguration."
    type: "Shellskript"
    language: "bash"
  - file: "08-ansible-inventory.yml"
    title: "Ansible-Inventory für den K3s-Node"
    description: "Zeigt ein minimales Inventory mit Dokumentations-IP für den K3s-Server."
    type: "Ansible-Inventory"
    language: "yaml"
  - file: "09-k3s-validation.sh"
    title: "K3s-Node und Secrets Encryption validieren"
    description: "Prüft Node-Status, System-Pods und die aktivierte Verschlüsselung von Kubernetes Secrets."
    type: "Shellskript"
    language: "bash"
  - file: "10-kubeconfig-admin-setup.sh"
    title: "Kubeconfig auf den Admin-Rechner übernehmen"
    description: "Kopiert die K3s-Kubeconfig per SSH, setzt die interne Node-Adresse und testet den Zugriff."
    type: "Shellskript"
    language: "bash"
  - file: "11-minimal-http-deployment-service.yml"
    title: "Minimaler HTTP-Service als Deployment und ClusterIP"
    description: "Definiert ein übertragbares Deployment mit Readiness/Liveness-Probes und einen internen ClusterIP-Service."
    type: "Kubernetes-Manifest"
    language: "yaml"
  - file: "12-kubernetes-rollout-troubleshooting.sh"
    title: "Staging-Manifeste anwenden und Rollout prüfen"
    description: "Wendet Kustomize an, wartet auf Blog und Search und zeigt die wichtigsten Diagnosebefehle."
    type: "Shellskript"
    language: "bash"
  - file: "13-search-startup-probe.yml"
    title: "Startup-Probe für langsam startenden Search-Service"
    description: "Gibt einem Service mit Modell- oder Dateninitialisierung ein eigenes Startfenster vor Readiness und Liveness."
    type: "Kubernetes-Ausschnitt"
    language: "yaml"
  - file: "14-cloudflare-tunnel-secret.sh"
    title: "Cloudflare-Tunnel-Token als Kubernetes Secret anlegen"
    description: "Legt den Cloudflare-Namespace und das Tunnel-Secret an, ohne den Token in Git zu speichern."
    type: "Shellskript"
    language: "bash"
  - file: "15-external-staging-check.sh"
    title: "Staging von außen über DNS, HTTP und Healthcheck prüfen"
    description: "Prüft öffentliche DNS-Auflösung, HTTP-Header und den Healthcheck-Endpunkt."
    type: "Shellskript"
    language: "bash"
  - file: "16-troubleshoot-inside-out.sh"
    title: "Kubernetes und Cloudflare von innen nach außen debuggen"
    description: "Prüft Pod, Service, Cluster-DNS, Cross-Namespace-Zugriff, Tunnel und erst zuletzt den öffentlichen Endpunkt."
    type: "Shellskript"
    language: "bash"
---

Mein produktiver Blog bleibt vorerst auf Hetzner und Docker Compose. In diesem Teil geht es deshalb nicht darum, Produktion möglichst schnell auf Kubernetes umzuziehen, sondern um einen reproduzierbaren Weg von **einer normalen Container-Anwendung zu einem funktionierenden K3s-Staging auf Proxmox**.

Ist bereits ein Docker-Image der Anwendung vorhanden, lässt sich der Ablauf weitgehend übernehmen. Im Wesentlichen müssen nur Image, Container-Port, Healthcheck und Domain an den jeweiligen Stack angepasst werden.

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

Der K3s-Node heißt in diesem Aufbau `k3s-blog-01`. Die konkrete interne IP ist für das Konzept egal; wichtig ist nur, dass der Admin-Rechner den Node per SSH und später auf TCP 6443 erreichen kann.

## 1. Debian-VM in Proxmox anlegen

Verwendet wird eine Debian-13-Cloud-Image-VM mit diesen Ressourcen:

```text
Name:       k3s-blog-01
vCPU:       2
RAM:        4096 MB
Disk:       32 GB
Netzwerk:   internes Service-Netz
Public IP:  keine
```

Das lässt sich über die Proxmox-Oberfläche bauen. Für einen reproduzierbaren Aufbau steht die komplette `qm`-Variante als Snippet bereit:

[Debian-VM für K3s mit qm vorbereiten](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/07-proxmox-vm-bootstrap.sh "snippet:bash")

Der Name des importierten Volumes kann je nach Storage abweichen. Deshalb darf der Beispielwert `local-zfs:vm-105-disk-0` nicht blind übernommen werden; maßgeblich ist die Ausgabe von `qm config`.

Nach dem Boot reicht zunächst die Prüfung per `ssh obivan@<VM-IP>`. Für den Ansible-Bootstrap sollte zusätzlich `sudo -n true` ohne Ausgabe und Fehler durchlaufen.

## 2. K3s reproduzierbar mit Ansible installieren

Der Bootstrap liegt unter `infra/ansible/`. Das Inventory ist absichtlich nicht mit einer echten internen IP eingecheckt.

Ein minimales Beispiel:

[Ansible-Inventory für den K3s-Node](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/08-ansible-inventory.yml "snippet:yaml")

`192.0.2.10` ist dort nur ein Dokumentationswert. An dieser Stelle gehört die echte IP oder ein interner DNS-Name hinein.

Vor der Installation sollte `ansible all -m ping` ein `pong` liefern. Anschließend können `ansible-playbook playbooks/k3s.yml --syntax-check` und danach das eigentliche Playbook ausgeführt werden.

Das vollständige Bootstrap-Beispiel liegt hier:

[K3s-Node mit Ansible bootstrappen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/01-k3s-ansible-bootstrap.yml "snippet:yaml")

Wesentlich sind in diesem K3s-Setup `write-kubeconfig-mode: "0640"`, `secrets-encryption: true` sowie die deaktivierten Komponenten `traefik` und `servicelb`.

Traefik und ServiceLB sind hier nicht defekt oder unerwünscht. Sie werden schlicht nicht benötigt, weil der externe HTTP-Pfad später vollständig über `cloudflared` läuft.

## 3. Prüfen, ob Kubernetes wirklich funktioniert

Ein laufender `k3s.service` reicht nicht. Node, System-Pods und Secrets Encryption werden gemeinsam geprüft:

[K3s-Node und Secrets Encryption validieren](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/09-k3s-validation.sh "snippet:bash")

Der Node sollte ungefähr so erscheinen:

```text
NAME          STATUS   ROLES           VERSION
k3s-blog-01   Ready    control-plane   v1.x.x+k3s1
```

Mindestens CoreDNS und die übrigen benötigten K3s-Systemkomponenten sollten `Running` sein. Für die Verschlüsselung ist insbesondere diese Ausgabe relevant:

```text
Encryption Status: Enabled
```

Damit steht die Kubernetes-Basis.

## 4. Optional: Kubeconfig auf den Admin-Rechner holen

Alle weiteren Befehle können direkt auf dem Node mit `sudo k3s kubectl` ausgeführt werden. Bequemer ist ein normales `kubectl` auf dem Admin-Rechner.

Die komplette Übernahme inklusive Ersetzen von `127.0.0.1` durch die interne Node-Adresse ist ausgelagert:

[Kubeconfig auf den Admin-Rechner übernehmen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/10-kubeconfig-admin-setup.sh "snippet:bash")

In der resultierenden Datei muss der API-Server auf `https://<VM-IP>:6443` zeigen. Wenn `kubectl get nodes` anschließend wieder `Ready` meldet, können die restlichen Schritte vom Admin-Rechner aus erfolgen.

## 5. Namespace und Registry-Zugriff vorbereiten

Die Anwendung läuft im Namespace `blog-staging`. Dieser wird einmalig mit `kubectl create namespace blog-staging` angelegt.

Für öffentliche Images wäre damit bereits genug vorbereitet. Private GHCR-Images benötigen zusätzlich ein Pull-Secret:

[GHCR Pull Secret für den Staging-Namespace](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/02-ghcr-pull-secret.sh "snippet:bash")

Das Snippet erwartet `GITHUB_USER` und `GHCR_TOKEN` als Umgebungsvariablen. Mit `kubectl -n blog-staging get secret ghcr-pull` lässt sich anschließend prüfen, ob das Secret vorhanden ist.

Der Token selbst gehört nicht in Git und nicht als Klartext in ein Manifest.

## 6. Aus einem Container wird Deployment + Service

Für eine einfache Docker-Anwendung sind zunächst zwei Kubernetes-Ressourcen entscheidend:

```text
Deployment
  hält den Container am Laufen

Service
  gibt den Pods eine stabile interne Adresse
```

Ein vollständiges, aber bewusst minimales HTTP-Beispiel steht als Kubernetes-Snippet bereit:

[Minimaler HTTP-Service als Deployment und ClusterIP](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/11-minimal-http-deployment-service.yml "snippet:yaml")

Die vier Werte, die in fast jedem Setup angepasst werden müssen, sind `image`, `containerPort`, der Healthcheck-Pfad und der Service-Port.

Für den Blog kommt noch der Search-Service dazu. Beide bleiben reine `ClusterIP`-Services:

[Interne ClusterIP-Services für Blog und Search](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/03-blog-search-services.yml "snippet:yaml")

Der Blog erreicht Search im selben Namespace über `http://search:8090/search`.

Das ist der wichtige Unterschied zu Docker-Setups mit fest verdrahteten IPs: Pods dürfen wechseln. Der Service-Name bleibt.

## 7. Manifeste anwenden und Rollout beobachten

Im Repository liegen die Staging-Manifeste unter:

```text
infra/kubernetes/staging/
├── blog.yaml
├── cloudflared.yaml
└── kustomization.yaml
```

Anwenden, Rollout prüfen und bei Problemen direkt in Pods und Events schauen lässt sich mit einem gemeinsamen Snippet:

[Staging-Manifeste anwenden und Rollout prüfen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/12-kubernetes-rollout-troubleshooting.sh "snippet:bash")

Typische Fehler lassen sich damit meist schnell einer Schicht zuordnen: Registry-Zugriff, Container-Start, Probe, fehlende Umgebungsvariable oder Ressourcenlimit.

## 8. Die Anwendung zuerst intern testen

Cloudflare kommt erst dazu, wenn Kubernetes intern sauber funktioniert.

Zuerst wird der Blog direkt über seine ClusterIP und anschließend aus einem temporären Pod über Kubernetes DNS geprüft:

[Blog intern per ClusterIP und Kubernetes DNS testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/04-internal-healthchecks.sh "snippet:bash")

Erwartet wird:

```text
ok
```

Damit sind bereits Container, Service-Selector, Cluster-Netzwerk, CoreDNS und HTTP-Healthcheck geprüft.

Wenn das nicht funktioniert, bringt es nichts, gleichzeitig DNS bei Cloudflare oder TLS zu debuggen.

## 9. Probes müssen zum Startverhalten passen

Der Search-Container benötigt beim ersten Start deutlich länger als der kleine Blog-Webserver. Unter anderem werden Modell und Daten initialisiert.

Dafür wird zusätzlich eine `startupProbe` verwendet:

[Startup-Probe für langsam startenden Search-Service](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/13-search-startup-probe.yml "snippet:yaml")

Erst wenn diese Startphase erfolgreich war, übernehmen Readiness- und Liveness-Probe ihre normalen Aufgaben.

Beim ersten Aufbau hatte Search einmal einen Restart. Aus diesem einzelnen Ereignis ließ sich die konkrete Ursache nicht sauber bestimmen. Die `startupProbe` ist deshalb keine rückwirkende Erklärung dieses Restarts, sondern eine saubere Abbildung des tatsächlich längeren Startverhaltens.

## 10. Cloudflare Tunnel in Kubernetes starten

Jetzt kommt der öffentliche Zugriff dazu. Dafür wird ein bereits in Cloudflare angelegter Tunnel verwendet.

Namespace und Tunnel-Token werden ohne Klartext-Secret im Repository vorbereitet:

[Cloudflare-Tunnel-Token als Kubernetes Secret anlegen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/14-cloudflare-tunnel-secret.sh "snippet:bash")

Das Deployment liest anschließend nur die Secret-Referenz:

[cloudflared als Deployment im Cluster](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/05-cloudflared-deployment.yml "snippet:yaml")

Nach `kubectl apply -k infra/kubernetes/staging` lässt sich der Tunnel mit `kubectl -n cloudflare rollout status deployment/cloudflared` und `kubectl -n cloudflare get pods` prüfen.

Der Tunnel baut die Verbindung **aus dem Cluster nach außen** auf. Deshalb muss für diesen HTTP-Pfad kein Port 80 oder 443 zum K3s-Node weitergeleitet werden.

## 11. Vor Cloudflare den Cross-Namespace-Pfad testen

`cloudflared` läuft im Namespace `cloudflare`, der Blog in `blog-staging`. Deshalb wird genau der DNS-Name getestet, den später auch der Tunnel verwendet:

```text
blog.blog-staging.svc.cluster.local
```

Der Test dazu:

[Cloudflare-Namespace gegen den Blog-Service testen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/06-cross-namespace-healthcheck.sh "snippet:bash")

Erwartet wird wieder `ok`.

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

In Cloudflare zeigt der Public Hostname auf diesen Origin:

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

DNS-Auflösung, HTTP und Healthcheck sind in einem kleinen Prüf-Snippet zusammengefasst:

[Staging von außen über DNS, HTTP und Healthcheck prüfen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/15-external-staging-check.sh "snippet:bash")

Erwartet werden `HTTP/2 200` und für `/healthz` die Ausgabe `ok`.

Zunächst wurde `staging.blog.obivan.org` verwendet. DNS funktionierte, TLS jedoch nicht wie erwartet. Der praktische Unterschied: Ein Zertifikat für `*.obivan.org` deckt `staging-blog.obivan.org`, aber nicht automatisch die zusätzliche Ebene `staging.blog.obivan.org` ab. Für diesen Aufbau war der flachere Hostname deshalb die pragmatische Lösung.

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

Für die erste Migration empfiehlt sich **ein Service nach dem anderen**: erst Deployment + ClusterIP, intern testen, dann Abhängigkeiten, zuletzt den externen Zugriff.

## 15. Fehler systematisch von innen nach außen suchen

Wenn die öffentliche URL nicht funktioniert, sollte nicht alles gleichzeitig geprüft werden. Die komplette Diagnosekette ist als ausführbares Snippet abgelegt:

[Kubernetes und Cloudflare von innen nach außen debuggen](/snippets/2026-09-15-k3s-proxmox-cloudflare-part-1/16-troubleshoot-inside-out.sh "snippet:bash")

Die Reihenfolge geht bewusst vom Pod über Service und Cluster-DNS zum Tunnel und erst zuletzt zu DNS/TLS außerhalb des Clusters. Damit ist schnell sichtbar, ob der Fehler im Container, in Kubernetes, im Tunnel oder erst davor liegt.

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

Teil II automatisiert genau diesen funktionierenden Pfad. Dort kommen der `staging`-Branch, Git-SHA-getaggte Images, Kustomize-Pins und Flux dazu.

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
verifizierter Promotion-Candidate
      ↓
Promotion-PR nach main
```

Production bleibt dabei weiterhin bewusst ein manueller Merge.

## Querverweise

- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[docker-vs-docker-compose|Docker vs. Docker Compose]]