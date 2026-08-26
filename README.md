# Kernel Notes

Persönlicher IT-Blog mit Node.js, Express, Markdown, Docker und GitHub Actions.

## Features

- Markdown-Artikel mit Syntax Highlighting, Mermaid, Footnotes und Admonitions
- Tags mit eigenen Tag-Seiten und verwandten Beiträgen
- RSS-Feed unter `/rss.xml`
- Snippet Library für größere Codebeispiele
- Zentrales Glossar mit Tooltips und eigener Glossar-Seite
- Zentrale Quellenverwaltung und Wiki-Links zwischen Artikeln
- Kernel Grep als semantische Suche
- Wissensnetz / Knowledge Graph
- Artikel archivieren und wiederherstellen
- Automatische Artikel-Versionierung inklusive referenzierter Snippets und Bilder
- Historische Artikelstände unter `/history/<slug>`
- Obsidian-Workflow für Authoring und Publishing
- Content-Checks für Frontmatter, Referenzen, Glossar, Rechtschreibung und Regressionen
- Privacy-/Security-Hardening mit Security Headers und lokal ausgelieferten Browser-Dependencies
- CI/CD nach Hetzner mit getrenntem Content-Deployment und App-Deployment

## Lokal starten

```bash
docker compose up -d --build
```

Blog: `http://localhost:8080`

```bash
docker compose down
```

## Entwicklung

```bash
npm install
npm run lint
npm run test:coverage
```

Neuen Artikel anlegen:

```bash
npm run post:new -- "Mein Artikel"
```

Archivieren / wiederherstellen:

```bash
npm run post:archive -- mein-artikel
npm run post:restore -- mein-artikel
```

Wichtige Content-Checks:

```bash
npm run posts:validate-meta
npm run references:check
npm run glossary:check
npm run posts:spellcheck
npm run posts:proofread
npm run rag:test:regression
```

## Content

Aktive Artikel liegen unter `posts/`, archivierte unter `archive/`.

Die Artikelhistorie wird automatisch aus Git erzeugt. Änderungen an Markdown, referenzierten Snippets oder Bildern erzeugen eine neue Artikelversion.

```bash
npm run posts:build-history
```

Reine Content-Änderungen werden ohne Neubau des App-Images deployed.

## Deployment

```text
Feature Branch -> Pull Request -> CI -> Merge -> Hetzner
```

App-Änderungen bauen Images in GHCR. Content-only-Änderungen synchronisieren Artikel, Archiv, Snippets, Bilder und Historie separat.

Production verwendet `docker-compose.prod.yml`; `/healthz` dient als Healthcheck.

## Struktur

```text
posts/                  Aktive Artikel
archive/                Archivierte Artikel
post-history/           Generierte Artikelhistorie
snippets/               Codebeispiele
assets/                 Statische Assets und Artikelbilder
config/                 Glossar und Konfiguration
templates/              Markdown-/Obsidian-Templates
scripts/                Content- und Build-Tools
rag/                    Semantische Suche
ops/                    Betrieb und Deployment
docs/                   Technische Dokumentation
.github/workflows/      CI/CD
privacy-server.js       Express-Einstiegspunkt
docker-compose.yml      Lokale Umgebung
docker-compose.prod.yml Production
```

## Dokumentation

- `docs/article-lifecycle.md` – Archiv und Artikel-Versionierung
- `docs/glossary.md` – Glossar und Tooltips
- `docs/knowledge-graph.md` – Wissensnetz
- `docs/sources.md` – Quellen und Querverweise
- `docs/obsidian.md` – Authoring mit Obsidian
- `ops/hetzner/README.md` – Production-Deployment

## Versionierung

Die sichtbare Blog-Version liegt in `VERSION`. Reine Content-Änderungen erhöhen sie nicht; Features und Fixes folgen SemVer.
