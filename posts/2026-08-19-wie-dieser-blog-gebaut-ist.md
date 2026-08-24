---
id: 2026-08-19-wie-dieser-blog-gebaut-ist
version: 3
title: Wie dieser Blog gebaut ist
date: 2026-08-19
published_at: 2026-08-19T12:39:19+02:00
created_at: 2026-08-19
updated_at: 2026-08-24
author: obivan
reviewed_by: pending
category: Engineering
excerpt: Architektur, Stack und Entscheidungen hinter diesem IT-Blog. Welche Technologien genutzt werden und warum sie für diesen Use Case sinnvoll sind.
tags: Blog, Architecture, DevOps, Node
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

Die Runtime ist gehärtet (distroless), um die Angriffsoberfläche kleinzuhalten.

### 4) CI/CD mit GitHub Actions

Automatisiert werden u. a.:

- Linting
- Tests inkl. Coverage
- Compose Smoke-Test
- Build und Publish des Blog-Images nach GHCR
- Deployment des SHA-getaggten Images auf den Hetzner-Host

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

## Querverweise

- [[markdown-features-im-blog|Markdown-Features im Blog nutzen]]
- [[dependabot-im-einsatz|Dependabot im Einsatz]]
- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[kernel-grep-semantische-suche-fuer-meinen-blog|Kernel Grep]]

## Quellen

- [Express Dokumentation](/sources.html#express)
- [gray-matter](/sources.html#gray-matter)
- [markdown-it Dokumentation](/sources.html#markdown-it)
- [Docker Compose Referenz](/sources.html#docker-compose)
- [GitHub Actions](/sources.html#github-actions-docs)
- [GitHub Dependabot](/sources.html#github-dependabot-yml)
