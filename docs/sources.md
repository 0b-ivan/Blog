# Zentrale Quellen und Querverweise

Die Quellen der Blogbeiträge liegen zentral in `posts/_sources.json`. Gepflegt werden können sie als einzelne Markdown-Dateien in Obsidian unter `posts/_Quellen/`; der Sources-Publisher überträgt freigegebene Änderungen per Pull Request in den JSON-Katalog.

Details zum Obsidian-Workflow stehen in [`docs/obsidian-sources-cms.md`](obsidian-sources-cms.md).

Jede Quelle hat eine stabile ID, zum Beispiel:

```json
"docker-compose": {
  "title": "Compose file reference",
  "publisher": "Docker Docs",
  "url": "https://docs.docker.com/reference/compose-file/",
  "accessed_at": "2026-08-24"
}
```

## Quelle in einem Beitrag verwenden

Im Beitrag wird nur auf die Quellen-ID verwiesen:

```md
## Quellen

- [Docker Compose Dokumentation](/sources.html#docker-compose)
```

Die externe URL, der Herausgeber und das Abrufdatum bleiben damit zentral im Quellenkatalog. Ändert sich eine URL, muss sie nur einmal zentral angepasst werden.

Das vollständige Quellenverzeichnis wird unter `/sources.html` aus dem JSON-Katalog gerendert.

## Querverweise auf andere Beiträge

Interne Links bleiben als Wiki-Links lesbar:

```md
[[docker-vs-docker-compose|Docker vs. Docker Compose]]
```

Der erste Wert ist das Ziel, der zweite optional der sichtbare Linktext.

Der Zielname darf auch ohne Datumspräfix geschrieben werden. Der Validator prüft, ob der aktive Beitrag tatsächlich existiert.

## Prüfung

Lokal:

```bash
npm run references:check
```

Der Check prüft:

- gültige IDs im zentralen Quellenkatalog,
- Titel, Herausgeber und HTTP(S)-URL jeder Quelle,
- alle `/sources.html#...`-Verweise in aktiven und archivierten Beiträgen,
- alle Wiki-Links in aktiven Beiträgen,
- unbenutzte Quellen als Warnung.

Der gleiche Check läuft in der PR-Pipeline.
