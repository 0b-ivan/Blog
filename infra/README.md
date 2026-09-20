# Kernel Notes Infrastruktur

Dieses Verzeichnis enthält die Infrastruktur für die K3s-Umgebungen von Kernel Notes auf Proxmox sowie die dazugehörige Provisionierung.

## Zielbild

- Staging läuft auf K3s und wird unter `staging-blog.obivan.org` über Cloudflare Tunnel veröffentlicht.
- Production läuft ebenfalls auf K3s; `blog.obivan.org` zeigt auf diese Umgebung.
- Hetzner wird weiterhin aus `main` aktualisiert und dient als aktueller Standby- und Rollback-Origin.
- Ansible provisioniert die K3s-Hosts.
- Kubernetes verwaltet Blog, Kernel Grep und die umgebungsspezifischen Betriebsdienste.
- GitHub Actions baut die Container-Images und veröffentlicht sie in GHCR.
- Flux reconciliert den gewünschten Zustand pull-basiert aus Git.
- Staging und Production verwenden immutable Image-Tags auf Basis des jeweiligen Git-Commit-SHA.
- Für den Clusterbetrieb sind keine eingehenden Ports am Heimanschluss oder an NAT-Gateways erforderlich.

## Struktur

```text
infra/
├── ansible/                 Provisionierung der K3s-Hosts
└── kubernetes/
    ├── base/                Gemeinsame Kubernetes-Basis
    ├── staging/             Staging-Overlay, Flux und Chaos-Infrastruktur
    └── production/          Production-Overlay und Flux-Konfiguration
```

Die Detaildokumentation liegt in:

- `infra/kubernetes/staging/README.md`
- `infra/kubernetes/production/README.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/reliability.md`

## Staging-Bootstrap

1. Debian-VM in Proxmox anlegen.
2. `infra/ansible/inventory/staging/hosts.yml.example` nach `hosts.yml` kopieren und Host/IP anpassen.
3. Ansible ausführen.
4. Kubeconfig vom Node holen und Cluster prüfen.
5. GHCR Pull-Secret und Cloudflare Tunnel-Secret im Cluster anlegen.
6. `kubectl apply -k infra/kubernetes/staging` testen.
7. Staging-PR mergen.
8. Flux für `infra/kubernetes/staging/flux-system` gegen den Branch `staging` bootstrappen.

Production verwendet einen getrennten GitOps-Pfad über `production-gitops`; Details stehen in `infra/kubernetes/production/README.md`.

Secrets gehören nicht ins Repository.
