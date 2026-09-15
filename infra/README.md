# Blog Staging auf K3s

Dieses Verzeichnis enthält ausschließlich die Infrastruktur für die Staging-Instanz des Blogs auf Proxmox/K3s.

Zielbild:

- Produktion bleibt auf Hetzner mit `docker-compose.prod.yml`.
- Staging läuft auf einem einzelnen K3s-Node in Proxmox.
- `staging.blog.obivan.org` wird über Cloudflare Tunnel veröffentlicht.
- Es werden keine eingehenden Ports am Heimanschluss oder an den NAT-Gateways benötigt.
- Ansible konfiguriert den K3s-Host.
- Kubernetes verwaltet Blog, Kernel Grep und `cloudflared`.
- Flux wird erst gebootstrapped, wenn der Cluster erreichbar ist.

## Reihenfolge

1. Debian-VM in Proxmox anlegen.
2. `infra/ansible/inventory/staging/hosts.yml.example` nach `hosts.yml` kopieren und Host/IP anpassen.
3. Ansible ausführen.
4. Kubeconfig vom Node holen und Cluster prüfen.
5. GHCR Pull-Secret und Cloudflare Tunnel-Secret im Cluster anlegen.
6. `kubectl apply -k infra/kubernetes/staging` testen.
7. Erst danach Flux auf `infra/kubernetes/staging` bootstrappen.

Secrets gehören nicht ins Repository.
