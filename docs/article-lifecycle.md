# Artikel-Lifecycle: Archiv und Versionen

Kernel Notes trennt aktive Artikel, archivierte Artikel und automatisch erzeugte historische Snapshots.

## Aktive Artikel

Aktive Markdown-Dateien liegen unter:

```text
posts/
```

Sie erscheinen auf der Startseite, in der Artikel-API, im RSS-Feed und bei verwandten Beiträgen.

## Artikel archivieren

Archivieren verschiebt nur die Markdown-Datei. Snippets und Artikelbilder bleiben erhalten:

```bash
npm run post:archive -- mein-artikel
```

Danach liegt die Markdown-Datei unter:

```text
archive/
```

Der Beitrag verschwindet aus der normalen Artikelliste und dem RSS-Feed, bleibt aber unter `/archive` öffentlich lesbar. Wiederherstellen geht mit:

```bash
npm run post:restore -- mein-artikel
```

## Automatische Versionierung

Die sichtbare Artikelversion wird automatisch aus der Git-Historie erzeugt. Eine neue Version entsteht, wenn sich eines dieser Dinge ändert:

- die Markdown-Datei des Artikels
- ein im Artikel referenziertes Snippet unter `snippets/`
- ein im Artikel referenziertes Bild unter `assets/posts/`

Vor CI/CD wird ausgeführt:

```bash
npm run posts:build-history
```

Das erzeugt unter `post-history/` unveränderliche Snapshots. Dieser Ordner ist bis auf `.gitkeep` ignoriert und wird nicht manuell committed.

Jeder Snapshot enthält die damalige Markdown-Version und Kopien der damals referenzierten Snippets und Bilder. Dadurch zeigt beispielsweise `v2` auch später noch den Code und die Screenshots aus `v2` und nicht die Ressourcen der aktuellen Version.

Die Versionsansicht ist über den Artikel selbst oder direkt über folgende Route erreichbar:

```text
/history/<artikel-slug>
```

Eine konkrete Version liegt beispielsweise unter:

```text
/history/<artikel-slug>/v2
```

## Frontmatter-Feld `version`

Bestehende Beiträge enthalten weiterhin ein Frontmatter-Feld wie:

```yaml
version: 1
```

Dieses Feld bleibt vorerst aus Kompatibilitätsgründen erhalten. Die auf der Website angezeigte und für den Versionsverlauf verwendete Versionsnummer wird jedoch automatisch aus der Git-Historie berechnet und muss nicht manuell hochgezählt werden.

## Deployment

Änderungen ausschließlich an:

```text
posts/**
archive/**
snippets/**
assets/posts/**
```

laufen weiterhin über `Content CD`. Dabei wird die Historie neu erzeugt und zusammen mit aktuellem Content in persistente Docker-Volumes auf Hetzner synchronisiert. Das App-Image wird dafür nicht neu gebaut.
