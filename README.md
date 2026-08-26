# Kernel Notes

Persönlicher IT-Blog mit Node.js, Express, Markdown und Docker.

## Lokal starten

```bash
docker compose up -d --build
```

Blog: `http://localhost:8080`

Stoppen:

```bash
docker compose down
```

## Entwicklung

```bash
npm install
npm run lint
npm run test:coverage
```

Neue Beiträge:

```bash
npm run post:new -- "Mein Artikel"
```

Beiträge liegen unter `posts/`. Das Obsidian-Template liegt unter `templates/blog-post.md`.

Wichtige Content-Kommandos:

```bash
npm run posts:validate-meta
npm run references:check
npm run glossary:check
npm run rag:test:regression
```

## Deployment

Änderungen laufen über Pull Requests nach `main`.

```text
Feature Branch -> Pull Request -> CI -> Merge -> GHCR -> Hetzner
```

Production verwendet `docker-compose.prod.yml`. Das Deployment prüft anschließend `/healthz`.

## Struktur

```text
posts/                  Blogartikel
archive/                Archivierte Artikel
snippets/               Größere Codebeispiele
assets/                 Statische Assets
templates/              Markdown-/Obsidian-Templates
scripts/                Content- und Build-Skripte
rag/                    Semantische Suche
ops/                    Betriebs-/Deployment-Setup
.github/workflows/      CI/CD
privacy-server.js       Express-Anwendung
docker-compose.yml      Lokale Umgebung
docker-compose.prod.yml Production
```

## Weitere Dokumentation

- `docs/obsidian.md` – Obsidian und Authoring
- `ops/hetzner/README.md` – Hetzner-Deployment

## Versionierung

Die sichtbare Blog-Version liegt in `VERSION`. Reine Änderungen unter `posts/` erhöhen sie nicht; Features und Fixes folgen SemVer.
