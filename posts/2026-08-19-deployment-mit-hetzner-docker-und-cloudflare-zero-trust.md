---
id: 2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust
version: 2
title: 'Deployment mit Hetzner, Docker und Cloudflare Zero Trust'
date: 2026-08-19T00:00:00.000Z
published_at: 2026-08-19T21:57:52.000Z
created_at: 2026-08-19T00:00:00.000Z
updated_at: 2026-08-24T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Ein schlankes Deployment-Setup mit Hetzner Cloud, Docker Compose und
  Cloudflare Zero Trust – inklusive Tunnel, Zugriffsschutz und automatischem
  Deployment.
tags: 'Hetzner, Docker, Cloudflare, Zero-Trust, DevOps'
search_queries:
  - query: >-
      Wie sichere ich einen internen Admin-Dienst mit Cloudflare Zero Trust ab,
      ohne Server-Ports öffentlich zu öffnen?
    maxRank: 1
  - query: Wie veröffentliche ich einen Container ohne Ports am Server zu öffnen?
    maxRank: 1
snippets:
  - file: 01-deployment.sh
    title: Compose-Images laden und Services aktualisieren
    description: Lädt die Images und aktualisiert die Services mit Docker Compose.
    type: Shellskript
    language: bash
  - file: 02-updates-und-rollbacks.yml
    title: Blog-Image auf einen festen Stand setzen
    description: Zeigt einen festen Image-Tag für den Blog-Service.
    type: Compose-Ausschnitt
    language: yaml
cover_query: docker container
cover_provider: pixabay
cover_provider_id: '1012422'
cover_image: >-
  /assets/covers/2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust.jpg
cover_alt: >-
  container, blue, container carrier, metal, container, container, container,
  container, container, container carrier, container carrier
cover_focus: center
cover_credit: by ennelise via Pixabay
cover_credit_url: 'https://pixabay.com/photos/container-blue-container-carrier-1012422/'
cover_source_url: 'https://pixabay.com/photos/container-blue-container-carrier-1012422/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 80
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
Docker Application
```

Damit eignet sich das Setup besonders gut für interne Anwendungen wie:

- Admin-Oberflächen
- Monitoring
- interne Tools
- Home-Lab-Dienste
- Entwicklungsumgebungen

Ein Dienst muss dadurch nicht nur deshalb direkt aus dem Internet erreichbar sein, weil ich von unterwegs darauf zugreifen möchte.

## Public und Private Services trennen

Nicht jede Anwendung muss geschützt sein.

Ein Blog soll beispielsweise öffentlich erreichbar sein:

```text
blog.example.de
   ↓
Cloudflare
   ↓
Tunnel
   ↓
Blog Container
```

Eine Admin-Oberfläche dagegen:

```text
admin.example.de
   ↓
Cloudflare Access
   ↓
Authentifizierung
   ↓
Tunnel
   ↓
Admin Container
```

Beide Dienste können auf demselben Hetzner Server laufen. Der Unterschied liegt vor allem in der Cloudflare-Konfiguration.

## Deployment

Das eigentliche Deployment bleibt sehr einfach.

Das Docker Image wird in CI gebaut und in eine Registry gepusht. Auf dem Hetzner Server reichen anschließend im Kern Befehle wie:

[Deployment](/snippets/2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust/01-deployment.sh "snippet:bash")

Der Ablauf sieht dann ungefähr so aus:

```text
Git Push
   ↓
Docker Image bauen
   ↓
Container Registry
   ↓
Hetzner Server
   ↓
docker compose pull
   ↓
docker compose up -d
   ↓
Cloudflare Tunnel
   ↓
Application erreichbar
```

In diesem Blog läuft es bereits nach genau diesem Grundprinzip: Nach einem Merge nach `main` baut GitHub Actions ein unveränderliches Docker Image, pusht es nach GHCR und deployed anschließend das konkrete SHA-Image auf den Hetzner Host.

## Updates und Rollbacks

Für produktive Deployments sind feste Image-Tags beziehungsweise noch besser ein konkreter Commit-SHA sinnvoller als ausschließlich `latest`.

Zum Beispiel:

[Updates und Rollbacks](/snippets/2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust/02-updates-und-rollbacks.yml "snippet:yaml")

Damit ist nachvollziehbar, welcher Stand gerade läuft.

Wenn ein Deployment fehlschlägt, lässt sich gezielt wieder das vorherige Image starten. Ein automatischer Healthcheck kann zusätzlich prüfen, ob die neue Version wirklich erreichbar ist, bevor das Deployment als erfolgreich gilt.

## Warum mir dieses Setup gefällt

Das Setup ist vergleichsweise einfach, trennt die einzelnen Aufgaben aber trotzdem sauber voneinander.

```text
Cloudflare
    ↓
Zugriff und TLS

Hetzner
    ↓
Server

Docker
    ↓
Anwendungen
```

Dazu kommt ein wichtiger Vorteil: Viele Dienste müssen überhaupt nicht mehr direkt über die öffentliche IP des Servers erreichbar sein.

Für kleinere Projekte, interne Anwendungen und Self-Hosting ist die Kombination aus **Hetzner + Docker + Cloudflare Zero Trust** deshalb ein sehr interessantes Setup.

Man bekommt eine überschaubare Infrastruktur, einfache Deployments und kann trotzdem sehr genau kontrollieren, welche Dienste öffentlich und welche nur nach Authentifizierung erreichbar sind.

## Querverweise

- [[docker-vs-docker-compose|Docker vs. Docker Compose]]
- [[wie-dieser-blog-gebaut-ist|Wie dieser Blog gebaut ist]]

## Quellen

- [Hetzner Cloud Dokumentation](/sources.html#hetzner-cloud)
- [Docker Compose Referenz](/sources.html#docker-compose)
- [Docker Compose in Produktion](/sources.html#docker-compose-production)
- [Cloudflare Tunnel](/sources.html#cloudflare-tunnel)
- [Cloudflare Access](/sources.html#cloudflare-access)
