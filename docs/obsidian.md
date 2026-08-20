# Kernel Notes mit Obsidian verwalten

Das komplette Repository kann als Obsidian-Vault geoeffnet werden. Die eigentlichen Blogartikel bleiben normale Markdown-Dateien unter `posts/`; GitHub, CI und Deployment funktionieren dadurch unveraendert weiter.

## Einmaliges Setup

1. Repository lokal klonen.
2. In Obsidian `Open folder as vault` waehlen und den Repository-Ordner `Blog` oeffnen.
3. Den Obsidian-Core-Plugin `Templates` aktivieren.
4. Als Template-Ordner `templates` konfigurieren.
5. Unter `Files & Links` den Attachment-Ordner auf `assets` setzen, wenn Bilder direkt aus Obsidian eingefuegt werden sollen.

Lokale Workspace-Zustaende von Obsidian werden nicht committed. Die eigentlichen Inhalte und Templates bleiben dagegen Teil des Repositories.

## Neuer Artikel per Obsidian

Der sichere Weg ist zuerst einen Feature-Branch anzulegen:

```bash
git switch main
git pull
git switch -c post/mein-artikel
```

Danach in Obsidian eine neue Datei unter `posts/` mit einem Namen nach diesem Muster erstellen:

```text
2026-08-20-mein-artikel.md
```

Anschliessend das Template `templates/blog-post.md` einfuegen. Weil `{{title}}` in Obsidian dem Dateinamen entspricht, wird die `id` dabei automatisch aus dem Dateinamen uebernommen. Den sichtbaren `title`, `category`, `excerpt` und die `tags` danach ausfuellen.

## Neuer Artikel per CLI

Alternativ erzeugt der Generator eine fertige Datei mit Slug und dem von der CI erwarteten Frontmatter:

```bash
npm run post:new -- "SQLite - oefter benutzt als gedacht"
```

Optionale Metadaten koennen direkt mitgegeben werden:

```bash
npm run post:new -- \
  "SQLite - oefter benutzt als gedacht" \
  --category Datenbanken \
  --tags "SQLite,Linux,Self-Hosting" \
  --excerpt "SQLite begegnet mir im Self-Hosting haeufiger als gedacht."
```

Das erzeugt beispielsweise:

```text
posts/2026-08-20-sqlite-oefter-benutzt-als-gedacht.md
```

## Vor dem Push pruefen

```bash
npm run posts:validate-meta
npm run lint
npm run test:coverage
```

Danach normal committen und pushen:

```bash
git add posts/ assets/
git commit -m "Add SQLite post"
git push -u origin HEAD
```

Anschliessend einen Pull Request gegen `main` erstellen. Erst nach erfolgreicher CI und Merge wird der neue Stand automatisch deployed.

## Bilder

Bilder fuer Artikel sollten unter `assets/` liegen. Im Markdown koennen sie beispielsweise so referenziert werden:

```md
![Beschreibung](/assets/mein-bild.png)
```

Root-relative Pfade funktionieren sowohl auf der Website als auch im RSS-Feed korrekt.

## Was nicht ins Repository gehoert

Obsidian erzeugt lokale UI- und Workspace-Dateien. Diese sind benutzerspezifisch und werden ueber `.gitignore` ausgeschlossen. Community-Plugins sollten ebenfalls nicht ungeprueft als Teil des Blog-Repositories committed werden.
