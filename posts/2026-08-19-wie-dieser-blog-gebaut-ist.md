---
id: 2026-08-19-wie-dieser-blog-gebaut-ist
version: 1
title: Wie dieser Blog gebaut ist
status: publish
date: 2026-08-19T00:00:00.000Z
created_at: 2026-08-19T00:00:00.000Z
updated_at: 2026-08-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: Engineering
excerpt: >-
  Architektur, Stack und Entscheidungen hinter diesem IT-Blog. Welche
  Technologien genutzt werden und warum sie für diesen Use Case sinnvoll sind.
tags:
  - Blog
  - Architecture
  - DevOps
  - Node
search_queries:
  - query: Warum braucht dieser Blog keine Datenbank?
    maxRank: 1
  - query: Wie ist die Architektur dieses Blogs aufgebaut?
    maxRank: 1
cover_query: website code server publishing deployment automation infrastructure cloud
cover_provider: pixabay
cover_provider_id: '2402637'
cover_image: /assets/covers/2026-08-19-wie-dieser-blog-gebaut-ist.jpg
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
cover_score: 84
---

Dieser Post ist der technische Einstieg in den Blog selbst: Was läuft hier, warum genau dieser Stack und welche Trade-offs wurden bewusst akzeptiert.


## Ziel des Projekts

Der Blog soll:

- schnell Inhalte publizieren können
- einfach auf einem kleinen Server laufen
- ohne großes CMS auskommen
- sauber containerisierbar und CI/CD-fähig sein
- für Security- und Ops-Themen gut geeignet sein

Kurz: pragmatisch, wartbar, nachvollziehbar.

## Verwendete Technologien

### 1) Node.js + Express

Der Server basiert auf `Node.js` mit `Express`.

Warum:

- sehr leichtgewichtig für dieses Routing- und Rendering-Setup
- unkompliziertes Deployment im Container
- gute Erweiterbarkeit für spätere API-Features

### 2) Markdown als Content-Format

Posts liegen als `.md`-Dateien im `posts/`-Ordner.

Genutzt wird:

- `gray-matter` für Frontmatter
- `markdown-it` für Rendering
- `markdown-it-footnote` für Fußnoten
- `markdown-it-container` für Admonitions (note/tip/warning)
- eigener Wiki-Link-Transformer für `[[...]]`
- Mermaid-Rendering für Diagramme

Warum:

- Schreiben bleibt schnell und editor-freundlich
- Content ist git-versioniert und reviewbar
- kein Lock-in in ein proprietäres CMS

### 3) Docker + Docker Compose

Die App läuft containerisiert.

Warum:

- reproduzierbare lokale und produktive Umgebungen
- einfache Deployments auch ohne Kubernetes
- klare Trennung von Build und Runtime

Die Runtime ist gehärtet (distroless), um die Angriffsoberfläche klein zu halten.

### 4) CI/CD mit GitHub Actions

Automatisiert werden u. a.:

- Linting
- Tests inkl. Coverage
- Compose Smoke-Test
- Build und Publish nach GHCR
- optionales Deploy nach OpenFaaS/faasd

Warum:

- weniger manuelle Fehler
- schnelle Rückmeldung bei Regressionen
- klare Pipeline für Build, Security und Auslieferung

### 5) Security-Automation

- Trivy-Scans in CI
- Dependabot für Dependency-Updates

Warum:

- Schwachstellen früh erkennen
- Sicherheitsstand kontinuierlich verbessern
- Security nicht als Einmalaktion behandeln

## Nachvollziehbarkeit und Content-Governance

Posts haben verpflichtende Metadaten im Frontmatter:

- `id`
- `version`
- `created_at`
- `updated_at`
- `author`
- `reviewed_by`

Dazu gibt es einen CI-Check, der fehlende Felder blockiert.

Warum:

- klarer Audit-Trail pro Beitrag
- konsistente Struktur für spätere Auswertungen
- bessere Teamfähigkeit bei mehreren Autoren

## Warum kein großes CMS oder Datenbank zuerst?

Aktuell ist File-basiert + Git die beste Balance aus:

- Einfachheit
- Wartbarkeit
- Transparenz

Eine zusätzliche DB ist erst sinnvoll, wenn komplexe Editorial-Workflows, Freigabeprozesse oder umfangreiche Auswertungen dazukommen.

## Fazit

Der Stack ist bewusst nicht maximal komplex, sondern maximal nützlich.

Markdown + Node + Docker + CI/CD liefert für einen technischen Blog bereits sehr viel: schnelle Iteration, gute Lesbarkeit im Repo, saubere Deployments und nachvollziehbare Änderungen.

Wenn sich Anforderungen ändern, lässt sich diese Basis schrittweise erweitern, ohne alles neu bauen zu müssen.
