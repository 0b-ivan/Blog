# Kernel Notes

Kernel Notes ist eine selbst gehostete Publishing- und Knowledge-Plattform für technische Inhalte. Artikel werden als Markdown gepflegt und durch Snippets, Glossar, zentrale Quellen, Artikelhistorie, semantische Suche, Knowledge Graph und GraphRAG ergänzt.

Staging und Production werden GitOps-basiert über GitHub Actions, GHCR, Flux und K3s betrieben. Die weiterhin aus `main` aktualisierte Hetzner-Installation dient als Standby- und Rollback-Origin.

## Features

- Markdown-Artikel mit Syntax Highlighting, Mermaid, Footnotes und Admonitions
- Tags mit eigenen Tag-Seiten und verwandten Beiträgen
- Privacy-first Artikelmetriken mit Lesefortschritt, Likes, lokalen Favoriten und nativer Teilen-Funktion
- RSS-Feed unter `/rss.xml`
- Snippet Library für größere Codebeispiele
- Zentrales Glossar mit Tooltips, eigener Glossar-Seite und automatischen Begriffsvorschlägen
- Zentrale Quellenverwaltung und Wiki-Links zwischen Artikeln
- Kernel Grep als semantische Suche auf Basis von E5 und DuckDB
- Wissensnetz / Knowledge Graph und GraphRAG-Retrieval
- Artikel archivieren und unter `/archive` weiterhin öffentlich lesen
- Automatische Artikel-Versionierung inklusive referenzierter Snippets und Bilder
- Historische Artikelstände unter `/history/<slug>`
- Obsidian-Workflow für Authoring und Publishing
- Content-Checks für Frontmatter, Referenzen, Glossar, Rechtschreibung und Regressionen
- Privacy-/Security-Hardening mit Security Headers und lokal ausgelieferten Browser-Dependencies
- GitOps-Staging und K3s-Production mit immutable SHA-Images
- Öffentlicher, sanitizierter Kubernetes-Status
- Kontrollierte Chaos-Experimente in Staging; Chaos Mesh ist für begrenzte Netzwerkexperimente vorbereitet
- Synchron gehaltenes Hetzner-Deployment als Standby und Rollback-Pfad

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

Aktive Artikel liegen unter `posts/`, archivierte unter `archive/`. Inline-Artikelbilder gehören lokal unter `assets/posts/<asset-scope>/`; Cover werden separat über die Pixabay-Pipeline unter `assets/covers/` gepflegt. Die Bild-Policy priorisiert echte Fotos/Screenshots vor bloßer Dekoration, verlangt Alt-Texte und verbietet externe Hotlinks. Details stehen in `docs/article-images.md`.

Die Artikelhistorie wird automatisch aus Git erzeugt. Änderungen an Markdown, referenzierten Snippets oder Bildern erzeugen eine neue Artikelversion.

```bash
npm run posts:build-history
```

Archivierte Artikel verschwinden aus der normalen Artikelliste und dem RSS-Feed, bleiben aber unter `/archive` öffentlich lesbar.

## Deployment

Der normale Veröffentlichungsweg ist:

```text
feature/*
   |
   | Pull Request + CI
   v
staging
   |
   | GitHub Actions -> GHCR
   | immutable SHA-Images
   v
Flux -> K3s Staging -> staging-blog.obivan.org
   |
   | öffentlicher Staging-Gate
   v
promotion/staging-verified
   |
   | manueller Merge
   v
main
   |
   +--> K3s Production -> blog.obivan.org
   |
   +--> Hetzner Standby / Rollback
```

Ein Merge nach `staging` veröffentlicht nichts direkt in Production. Erst der manuell gemergte Promotion-PR nach `main` gibt den Stand für Production frei.

K3s Production erhält auch bei Content-Änderungen neu gebaute, auf den Git-SHA gepinnte Images. Der parallele Hetzner-Pfad optimiert reine Content-Änderungen weiterhin über persistente Docker-Volumes und einen Live-Reindex von Kernel Grep.

Details stehen in `docs/deployment.md`.

## Runtime

Production startet den Blog über `seo-server.js`. Die Server-Schichten bauen aufeinander auf:

```text
server.js
  -> enhanced-server.js
  -> privacy-server.js
  -> seo-server.js
```

Staging verwendet zusätzlich `staging-server.js`, um die Umgebung sichtbar zu kennzeichnen.

Kernel Grep läuft als eigener Search-Service. In K3s ergänzt ein Status-Service die sanitizierte Betriebsansicht; Staging enthält zusätzlich die kontrollierte Chaos-Infrastruktur.

## Struktur

```text
posts/                  Aktive Artikel
archive/                Archivierte Artikel
post-history/           Generierte Artikelhistorie
snippets/               Codebeispiele
assets/                 Statische Assets und Artikelbilder
config/                 Glossar und Konfiguration
templates/              Markdown-/Obsidian-Templates
scripts/                Content-, Build- und Deployment-Tools
rag/                    Kernel Grep, Vektorsuche und GraphRAG
status-monitor/          Sanitizierter Kubernetes-Status
chaos-monkey/            Kontrollierte Staging-Chaos-Experimente
infra/                   Ansible, K3s, Kustomize und Flux
ops/                     Betrieb, Hetzner und Obsidian LiveSync
docs/                    Technische Dokumentation
.github/workflows/       CI/CD und Promotion
seo-server.js            Production-Einstiegspunkt
staging-server.js        Staging-Einstiegspunkt
docker-compose.yml       Lokale Umgebung
docker-compose.prod.yml  Hetzner-Standby
```

## Dokumentation

- `docs/architecture.md` – Produkt- und Runtime-Architektur
- `docs/deployment.md` – Branches, Staging, Promotion und Production
- `docs/reliability.md` – Status, Chaos Engineering und Guardrails
- `docs/article-lifecycle.md` – Archiv und Artikel-Versionierung
- `docs/article-images.md` – Cover, Inline-Bilder, Quellen, Ablage und CI-Regeln
- `docs/photo-connection.md` – lizenzierte Drittbilder materialisieren, validieren und versionieren
- `docs/analytics.md` – Artikelmetriken, Likes, Favoriten und Datenschutzmodell
- `docs/glossary.md` – Glossar und Tooltips
- `docs/knowledge-graph.md` – Wissensnetz und GraphRAG
- `docs/sources.md` – Quellen und Querverweise
- `docs/obsidian-sources-cms.md` – Quellenverwaltung über Obsidian
- `docs/obsidian.md` – Authoring mit Obsidian
- `infra/kubernetes/staging/README.md` – K3s-Staging
- `infra/kubernetes/production/README.md` – K3s-Production
- `ops/hetzner/README.md` – Hetzner-Standby und Deployment-Account

## Versionierung

Die sichtbare Blog-Version liegt in `VERSION`. Reine Content-Änderungen erhöhen sie nicht; Features und Fixes folgen SemVer.
