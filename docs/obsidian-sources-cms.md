# Quellen in Obsidian pflegen

Das zentrale Quellenverzeichnis kann über denselben LiveSync-Vault wie Artikel und Glossar gepflegt werden. Die veröffentlichte Runtime-Datei bleibt `posts/_sources.json`.

## Aufbau im Vault

Der `sources-publisher` erzeugt beim ersten Start aus dem vorhandenen Quellenkatalog einen lokalen, von Git ignorierten Ordner:

```text
posts/_Quellen/
├── _Vorlage.md
├── docker-compose.md
├── cloudflare-tunnel.md
└── ...
```

Da `_Quellen` innerhalb von `posts/` liegt, wird der Ordner über Self-hosted LiveSync nach Obsidian synchronisiert. Der Blog veröffentlicht die Dateien in `_Quellen/` nicht als Artikel.

## Format einer Quelle

```md
---
type: source
id: "docker-compose"
status: draft
title: "Compose file reference"
publisher: "Docker Docs"
url: "https://docs.docker.com/reference/compose-file/"
accessed_at: "2026-08-28"
---

# Compose file reference
```

Die `id` ist der stabile Schlüssel, der in Blogartikeln über `/sources.html#docker-compose` referenziert wird. Sie sollte nach Veröffentlichung nicht geändert werden.

Erlaubt sind für die ID Kleinbuchstaben, Zahlen sowie `.`, `_` und `-`. `url` muss eine HTTP- oder HTTPS-URL sein. `accessed_at` verwendet `YYYY-MM-DD`.

## Veröffentlichen

Solange eine Quelle `status: draft` hat, bleibt sie nur im LiveSync-Vault.

Zum Veröffentlichen:

```yaml
status: publish
```

Nach dem Debounce-Fenster erstellt der `sources-publisher` einen deterministischen Branch und genau einen Pull Request für diese Quellen-ID, zum Beispiel:

```text
obsidian-source/docker-compose
Quelle: docker-compose
```

Weitere Änderungen an derselben Obsidian-Datei aktualisieren denselben offenen PR. Erst nach dem Merge wird `posts/_sources.json` auf `main` geändert.

## Neue Quellen

Für eine neue Quelle `_Quellen/_Vorlage.md` kopieren, Dateiname und Frontmatter anpassen und zunächst `status: draft` lassen. Nach der Prüfung `status: publish` setzen.

Die Dateien unter `posts/_Quellen/` sind absichtlich Git-ignored. Sie sind die editierbare LiveSync-Darstellung des zentralen Quellenverzeichnisses; veröffentlicht wird ausschließlich per Pull Request nach `posts/_sources.json`.
