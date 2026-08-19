---
id: 2026-08-19-wie-dieser-blog-gebaut-ist
version: 1
title: Wie dieser Blog gebaut ist
date: 2026-08-19
created_at: 2026-08-19
updated_at: 2026-08-19
author: obivan
reviewed_by: pending
category: Engineering
excerpt: Architektur, Stack und Entscheidungen hinter diesem IT-Blog. Welche Technologien genutzt werden und warum sie fuer diesen Use Case sinnvoll sind.
tags: Blog, Architecture, DevOps, Node
---

Dieser Post ist der technische Einstieg in den Blog selbst: Was laeuft hier, warum genau dieser Stack und welche Trade-offs wurden bewusst akzeptiert.

## Ziel des Projekts

Der Blog soll:

- schnell Inhalte publizieren koennen
- einfach auf einem kleinen Server laufen
- ohne grosses CMS auskommen
- sauber containerisierbar und CI/CD-faehig sein
- fuer Security- und Ops-Themen gut geeignet sein

Kurz: pragmatisch, wartbar, nachvollziehbar.

## Verwendete Technologien

### 1) Node.js + Express

Der Server basiert auf `Node.js` mit `Express`.

Warum:

- sehr leichtgewichtig fuer dieses Routing- und Rendering-Setup
- unkompliziertes Deployment im Container
- gute Erweiterbarkeit fuer spaetere API-Features

### 2) Markdown als Content-Format

Posts liegen als `.md`-Dateien im `posts/`-Ordner.

Genutzt wird:

- `gray-matter` fuer Frontmatter
- `markdown-it` fuer Rendering
- `markdown-it-footnote` fuer Fussnoten
- `markdown-it-container` fuer Admonitions (note/tip/warning)
- eigener Wiki-Link-Transformer fuer `[[...]]`
- Mermaid-Rendering fuer Diagramme

Warum:

- Schreiben bleibt schnell und editor-freundlich
- Content ist git-versioniert und reviewbar
- kein Lock-in in ein proprietaeres CMS

### 3) Docker + Docker Compose

Die App laeuft containerisiert.

Warum:

- reproduzierbare lokale und produktive Umgebungen
- einfache Deployments auch ohne Kubernetes
- klare Trennung von Build und Runtime

Die Runtime ist gehaertet (distroless), um die Angriffsoberflaeche klein zu halten.

### 4) CI/CD mit GitHub Actions

Automatisiert werden u. a.:

- Linting
- Tests inkl. Coverage
- Compose Smoke-Test
- Build und Publish nach GHCR
- optionales Deploy nach OpenFaaS/faasd

Warum:

- weniger manuelle Fehler
- schnelle Rueckmeldung bei Regressionen
- klare Pipeline fuer Build, Security und Auslieferung

### 5) Security-Automation

- Trivy-Scans in CI
- Dependabot fuer Dependency-Updates

Warum:

- Schwachstellen frueh erkennen
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
- konsistente Struktur fuer spaetere Auswertungen
- bessere Teamfaehigkeit bei mehreren Autoren

## Warum kein grosses CMS oder Datenbank zuerst?

Aktuell ist File-basiert + Git die beste Balance aus:

- Einfachheit
- Wartbarkeit
- Transparenz

Eine zusaetzliche DB ist erst sinnvoll, wenn komplexe Editorial-Workflows, Freigabeprozesse oder umfangreiche Auswertungen dazukommen.

## Fazit

Der Stack ist bewusst nicht maximal komplex, sondern maximal nuetzlich.

Markdown + Node + Docker + CI/CD liefert fuer einen technischen Blog bereits sehr viel: schnelle Iteration, gute Lesbarkeit im Repo, saubere Deployments und nachvollziehbare Aenderungen.

Wenn sich Anforderungen aendern, laesst sich diese Basis schrittweise erweitern, ohne alles neu bauen zu muessen.
