---
id: 2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust
version: 2
title: Deployment mit Hetzner, Docker und Cloudflare Zero Trust
date: 2026-08-19
published_at: 2026-08-19T23:57:52+02:00
created_at: 2026-08-19
updated_at: 2026-08-24
author: obivan
reviewed_by: pending
category: DevOps
excerpt: Ein schlankes Deployment-Setup mit Hetzner Cloud, Docker Compose und Cloudflare Zero Trust – inklusive Tunnel, Zugriffsschutz und automatischem Deployment.
tags: Hetzner, Docker, Cloudflare, Zero Trust, DevOps
search_queries:
  - query: Wie sichere ich einen internen Admin-Dienst ab, ohne ihn direkt öffentlich erreichbar zu machen?
    maxRank: 1
  - query: Wie veröffentliche ich einen Container ohne Ports am Server zu öffnen?
    maxRank: 1
---

Für kleinere Webanwendungen und selbst gehostete Dienste braucht es nicht immer Kubernetes oder eine große Cloud-Plattform.

Ein sehr schlankes Setup lässt sich bereits mit **Hetzner Cloud, Docker und Cloudflare Zero Trust** aufbauen.

Die Idee dahinter:

```text
Internet
   ↓
Cloudflare
   ↓
Cloudflare Zero Trust / Tunnel
   ↓
Hetzner Cloud Server
   ↓
Docker Compose
   ↓
Application
```

## Warum diese Kombination?

Hetzner stellt im Grunde einfach den Server bereit.

Docker kümmert sich darum, dass Anwendungen reproduzierbar und voneinander getrennt betrieben werden können.

Cloudflare übernimmt DNS, TLS und den kontrollierten Zugriff von außen.

```text
Hetzner     → Compute und Storage
Docker      → Anwendungen
Cloudflare  → DNS, TLS und Zugriffsschutz
```

## Docker auf dem Hetzner Server

Die Anwendungen laufen als Docker Container und werden über Docker Compose verwaltet.

Ein Setup kann beispielsweise aus mehreren Containern bestehen:

```text
Docker Host
│
├── application
├── database
├── redis
└── cloudflared
```

Persistente Daten werden über Docker Volumes oder zusätzlichen Storage gespeichert und liegen damit nicht ausschließlich innerhalb der Container.

## Cloudflare Tunnel statt offener Ports

Normalerweise müsste eine Anwendung beispielsweise über Port 443 öffentlich auf dem Hetzner Server erreichbar sein:

```text
Internet
   ↓
Hetzner Public IP
   ↓
443/tcp
   ↓
Reverse Proxy
   ↓
Application
```

Mit einem Cloudflare Tunnel dreht sich die Verbindung dagegen um.

Der `cloudflared`-Dienst auf dem Server baut selbst eine ausgehende Verbindung zu Cloudflare auf:

```text
Application
     ↑
 cloudflared
     │
     │ ausgehende Verbindung
     ↓
 Cloudflare
     ↑
     │
   Benutzer
```

Dadurch muss die eigentliche Anwendung nicht direkt aus dem Internet erreichbar sein.

Ein interner Dienst kann beispielsweise über eine eigene Subdomain auf einen lokalen Docker-Service oder eine interne Adresse weitergeleitet werden, ohne den Zielport öffentlich auf dem Server freizugeben.

## Cloudflare Zero Trust davor

Der Tunnel verbindet den Dienst mit Cloudflare. Mit **Cloudflare Access** kann zusätzlich festgelegt werden, wer darauf zugreifen darf.

```text
Benutzer
   ↓
service.example.de
   ↓
Cloudflare Access
   ↓
Authentifizierung
   ↓
Cloudflare Tunnel
   ↓
interner Docker-Service
```

Damit lässt sich zum Beispiel eine Admin-Oberfläche absichern, ohne sie einfach offen ins Internet zu stellen.

## Deployment

Der eigentliche Deployment-Prozess bleibt bewusst einfach.

Eine mögliche Pipeline:

```text
Git Push
   ↓
CI
   ↓
Docker Image bauen
   ↓
Image Registry
   ↓
Hetzner Server
   ↓
docker compose pull
   ↓
docker compose up -d
```

Der Server selbst braucht dadurch keine komplizierte Orchestrierung.

Für kleine Anwendungen reicht häufig bereits ein Compose-Stack.

## Warum kein Kubernetes?

Kubernetes löst viele echte Probleme.

Für einen einzelnen Server mit wenigen Anwendungen bringt es aber auch zusätzliche Komplexität mit:

- Cluster-Verwaltung
- Ingress Controller
- Secrets Management
- zusätzliche Netzwerkebenen
- mehr Komponenten, die gewartet werden müssen

Für kleine Self-Hosting- oder Blog-Projekte ist deshalb ein einfacher Docker-Compose-Stack oft völlig ausreichend.

## Mein aktuelles Setup

Das Grundprinzip sieht damit so aus:

```text
GitHub
   ↓
CI/CD
   ↓
Container Registry
   ↓
Hetzner Cloud
   ↓
Docker Compose
   ↓
Cloudflare Tunnel
   ↓
Cloudflare Zero Trust
   ↓
Benutzer
```

Der interessante Teil ist dabei weniger Docker selbst.

Der größte Vorteil ist für mich, dass Dienste veröffentlicht werden können, ohne jeden Service direkt über die öffentliche IP des Servers erreichbar zu machen.

Cloudflare übernimmt dabei den kontrollierten Einstiegspunkt.

## Fazit

Für kleinere Anwendungen gefällt mir diese Kombination aktuell sehr gut:

```text
Hetzner
+
Docker Compose
+
Cloudflare Tunnel
+
Zero Trust
```

Das Setup bleibt relativ klein, reproduzierbar und gut nachvollziehbar.

Gleichzeitig müssen interne Dienste nicht einfach offen im Internet stehen.

Für große Plattformen würde ich weiterhin andere Lösungen verwenden.

Für kleine Webanwendungen, interne Tools und Self-Hosting-Projekte ist dieses Setup aber erstaunlich leistungsfähig.

## Querverweise

- [[docker-vs-docker-compose|Docker vs. Docker Compose: Was ist der Unterschied?]]
- [[wie-dieser-blog-gebaut-ist|Wie dieser Blog gebaut ist]]
- [[kernel-grep-semantische-suche-fuer-meinen-blog|Kernel Grep – semantische Suche für meinen Blog]]

## Quellen

- [Docker Compose Dokumentation](/sources.html#docker-compose)
- [Cloudflare Tunnel Dokumentation](/sources.html#cloudflare-tunnel)
- [Cloudflare Access Dokumentation](/sources.html#cloudflare-access)
- [Hetzner Cloud Dokumentation](/sources.html#hetzner-cloud)
