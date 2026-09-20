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

Der Content-Lifecycle folgt demselben Promotion-Pfad wie Anwendungsänderungen:

```text
Feature-Branch -> PR nach staging -> Staging-Deployment -> Verifikation
               -> Promotion-PR -> main -> Production
```

Content-relevant sind insbesondere:

```text
posts/**
archive/**
snippets/**
assets/posts/**
```

### Staging und K3s Production

Für Staging erzeugt `.github/workflows/cd-staging.yml` bei Content-Änderungen neue immutable Images und pinnt sie auf den Git-Commit-SHA. Nach dem verifizierten Promotion-PR baut der K3s-Production-Pfad den freigegebenen `main`-Stand ebenfalls als immutable SHA-Images.

Damit enthalten K3s-Deployments immer einen reproduzierbaren Content-Stand im Image.

### Hetzner-Standby

Der parallele Hetzner-Pfad in `.github/workflows/cd.yml` optimiert reine Content-Änderungen weiterhin ohne vollständigen Image-Rebuild:

1. Artikelhistorie erzeugen,
2. Posts, Archiv, Snippets, Artikelbilder und History paketieren,
3. Inhalt in die persistenten Docker-Volumes synchronisieren,
4. Kernel Grep live reindizieren,
5. Health-, API- und Archiv-Smokechecks ausführen.

Bei Anwendungs- oder Runtime-Änderungen führt derselbe Workflow ein vollständiges Image-Deployment auf Hetzner aus.

Hetzner bleibt damit aus `main` synchron und kann als aktueller Standby-/Rollback-Origin verwendet werden.
