# Photo Connection

Die Photo Connection materialisiert rechteklare Drittbilder für Blogartikel reproduzierbar in das Repository.

Sie löst ein konkretes Problem: Artikel sollen echte Fotos und historische Abbildungen verwenden können, ohne externe Bilder zu hotlinken oder Binärdateien manuell durch Chat-, Browser- oder GitHub-Clients zu kopieren.

Der erste unterstützte Provider ist **Wikimedia Commons**.

## Zielbild

```text
Artikel + Photo-Manifest
          |
          | Push auf Artikel-/Photo-Branch
          v
.github/workflows/article-photos.yml
          |
          v
scripts/ingest-article-photos.js
          |
          +--> Wikimedia-Commons-API
          |       |
          |       +--> Autor
          |       +--> Lizenz
          |       +--> MIME-Type
          |       +--> Thumbnail-/Download-URL
          |
          +--> Download + Validierung
          |
          +--> assets/posts/<asset-scope>/
          |
          +--> posts/_sources.json
          |
          v
Commit durch github-actions[bot]
          |
          v
normaler PR gegen staging
```

Das Ergebnis ist ein normaler Git-Stand. Website, RSS, EPUB, PDF und Artikelhistorie arbeiten anschließend ausschließlich mit lokalen Dateien.

## Wann die Connection verwendet wird

Die Photo Connection ist für **fremde, rechteklar wiederverwendbare Inline-Bilder** gedacht.

Typische Beispiele:

- historische Fotos,
- Geräte- oder Produktaufnahmen,
- Porträts,
- dokumentarische Aufnahmen,
- frei lizenzierte Screenshots oder Scans, sofern ihre Lizenz wirklich passt.

Nicht dafür gedacht sind:

- Artikel-Cover — dafür existiert die Pixabay-Cover-Pipeline,
- eigene Screenshots oder eigene Fotos — diese können direkt unter `assets/posts/` abgelegt werden,
- beliebige Bild-URLs aus Suchmaschinen,
- Bilder ohne nachvollziehbare Wiederverwendungsrechte.

## Verzeichnisstruktur

```text
media/photos/
  pac-man-puck-man.json

assets/posts/
  pac-man-puck-man/
    04-arcade-machine.jpg
    05-toru-iwatani.jpg
    06-puck-man-handheld.jpg

posts/
  2026-09-24-pac-man-puck-man-paku-paku.md
  _sources.json
```

Das Manifest beschreibt **woher** ein Bild kommt und **wohin** es materialisiert wird. Die Binärdatei selbst wird anschließend von der Connection geladen und committed.

## Manifest

Ein Manifest liegt unter:

```text
media/photos/<asset-scope>.json
```

Beispiel:

```json
{
  "version": 1,
  "post": "posts/2026-09-24-pac-man-puck-man-paku-paku.md",
  "photos": [
    {
      "source_id": "pacman-commons-iwatani-gdc",
      "provider": "wikimedia-commons",
      "source": "https://commons.wikimedia.org/wiki/File:Toru_Iwatani,_creator_of_Pac-Man,_at_GDC_2011.jpg",
      "output": "assets/posts/pac-man-puck-man/05-toru-iwatani.jpg",
      "alt": "Tōru Iwatani, der Schöpfer von Pac-Man, bei der Game Developers Conference 2011",
      "expected_license": "CC BY 2.0",
      "width": 1200
    }
  ]
}
```

### Felder

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `version` | ja | Manifest-Version. Aktuell ausschließlich `1`. |
| `post` | ja | Artikel direkt unter `posts/`. |
| `photos` | ja | Mindestens ein Foto. |
| `source_id` | ja | Eindeutige ID für `posts/_sources.json` und `/sources.html#...`. |
| `provider` | ja | Aktuell `wikimedia-commons`. |
| `source` | ja | Wikimedia-Commons-`File:`-Seite, nicht die rohe Upload-URL. |
| `output` | ja | Lokaler Pfad unter `assets/posts/`. |
| `alt` | ja | Exakter Alt-Text, der auch im Artikel verwendet wird. |
| `expected_license` | empfohlen | Erwartete Lizenz. Eine Änderung auf der Quellseite lässt die Pipeline bewusst fehlschlagen. |
| `width` | optional | Zielbreite der von Commons gelieferten Variante; 320–2400 px. |
| `max_bytes` | optional | Maximale Downloadgröße für diesen Eintrag. Standard: 5 MiB. |

Zusätzliche Metadaten wie `connection_revision` können verwendet werden, um ein Manifest bewusst erneut zu materialisieren. Sie werden vom Ingest-Skript ignoriert.

## Artikelbindung

Die Connection verlangt, dass das Bild bereits korrekt im Markdown referenziert wird.

Beispiel:

```md
![Tōru Iwatani, der Schöpfer von Pac-Man, bei der Game Developers Conference 2011](/assets/posts/pac-man-puck-man/05-toru-iwatani.jpg)

*Tōru Iwatani bei der GDC 2011. Foto: Official GDC, CC BY 2.0, via [Wikimedia Commons](/sources.html#pacman-commons-iwatani-gdc).*
```

Zwei Bindungen werden geprüft:

1. Der Alt-Text und der lokale Zielpfad müssen exakt zum Manifest passen.
2. Der Artikel muss `/sources.html#<source_id>` referenzieren.

Damit kann ein Manifest nicht still ein fremdes Bild in einen Artikel schreiben, ohne dass die redaktionelle Zuordnung im Markdown sichtbar ist.

## Unterstützte Lizenzen

Die Connection akzeptiert aktuell nur klar wiederverwendbare Commons-Lizenzen:

- CC0
- Public Domain
- CC BY
- CC BY-SA

Andere oder unklare Lizenzangaben führen zum Abbruch.

Wenn `expected_license` gesetzt ist, muss die von Wikimedia Commons aktuell gemeldete Lizenz exakt dazu passen. Das ist eine zusätzliche Schutzschicht gegen nachträgliche Änderungen oder falsch ausgewählte Dateien.

Die Connection entscheidet **nicht**, ob ein Motiv redaktionell sinnvoll ist. Sie prüft technische und lizenzbezogene Mindestbedingungen. Die Bildauswahl bleibt Teil des Reviews.

## Was beim Download geprüft wird

Vor dem Schreiben ins Repository werden geprüft:

- HTTPS-/Provider-Zulässigkeit,
- gültige Wikimedia-Commons-`File:`-Seite,
- existierende Quelldatei,
- wiederverwendbare Lizenz,
- erwartete Lizenz,
- erlaubter MIME-Type,
- maximale Dateigröße,
- Mindestgröße von 1024 Byte,
- Magic Bytes des Bildformats,
- Übereinstimmung von Dateiendung und tatsächlichem Bildformat,
- Zielpfad ausschließlich unter `assets/posts/`.

Aktuell werden als Rasterformate unterstützt:

- JPEG
- PNG
- WebP

Externe SVG-Dateien werden von der Photo Connection bewusst nicht übernommen.

## URL direkt im Artikel

Für Wikimedia-Commons-Bilder kann im Artikel zunächst direkt die externe Bild-URL verwendet werden. Beispiel:

```md
![Tōru Iwatani bei der GDC](https://upload.wikimedia.org/wikipedia/commons/.../Toru_Iwatani.jpg)
```

Beim Push eines geänderten Artikels auf einen unterstützten Feature-Branch führt die Photo Connection automatisch folgende Schritte aus:

1. externe Commons-URL erkennen,
2. kanonische Commons-`File:`-Quelle ableiten,
3. stabiles `source_id` und lokales Ziel unter `assets/posts/<asset-scope>/` erzeugen,
4. Photo-Manifest unter `media/photos/` anlegen oder erweitern,
5. den Hotlink im Markdown durch den lokalen Root-Pfad ersetzen,
6. einen Quellen-/Lizenzlink zu `/sources.html#<source_id>` ergänzen,
7. anschließend den normalen Commons-Ingest mit Lizenz-, MIME-, Größen- und Magic-Byte-Prüfung ausführen.

Der Git-Stand enthält danach keinen externen Bild-Hotlink mehr.

Unterstützt werden aktuell Commons-`File:`-Seiten, `Special:Redirect/file/` und direkte `upload.wikimedia.org`-URLs für JPEG, PNG und WebP. Andere externe Provider werden absichtlich abgelehnt, bis dafür ein Provider-Adapter mit belastbaren Lizenzmetadaten existiert.

Lokal kann derselbe Schritt explizit ausgeführt werden:

```bash
npm run photos:materialize-links -- posts/2026-09-24-mein-artikel.md
npm run photos:ingest -- media/photos/mein-artikel.json
```

## Automatischer GitHub-Workflow

Workflow:

```text
.github/workflows/article-photos.yml
```

Er reagiert auf Änderungen an `media/photos/*.json` **und `posts/*.md`** auf diesen Branch-Mustern:

```text
photo/**
post/**
obsidian/**
feat/**
fix/**
```

Der normale Ablauf ist:

1. Branch aus `staging` erstellen.
2. Artikel bearbeiten.
3. Entweder einen unterstützten Commons-Hotlink direkt als Markdown-Bild einfügen **oder** ein Manifest manuell pflegen.
4. Push.
5. `Materialize Article Photos` startet.
6. Externe Commons-Bildlinks werden automatisch in lokale Pfade + Manifest umgeschrieben.
7. Bilder werden heruntergeladen und geprüft.
8. `posts/_sources.json` wird aktualisiert.
9. Local-Asset- und Quellenchecks laufen.
10. `github-actions[bot]` committed Artikel, Manifest, Quellen und materialisierte Dateien auf **denselben Branch**.
11. Der normale PR enthält danach ausschließlich lokale Bildreferenzen.

Ein Branch-Update ohne geändertes Photo-Manifest ist ein **erfolgreicher No-op**. Das ist wichtig bei Rebase, Konfliktauflösung oder automatischen Folge-Commits.

## Manueller Workflow

Die Action kann auch über `workflow_dispatch` gestartet werden.

Als `manifest` wird beispielsweise angegeben:

```text
media/photos/pac-man-puck-man.json
```

Das ist nützlich, wenn ein Manifest erneut materialisiert werden soll, ohne seinen Inhalt zu ändern.

## Lokal ausführen

```bash
npm run photos:ingest -- media/photos/pac-man-puck-man.json
```

Danach prüfen:

```bash
node scripts/check-local-assets.js
npm run references:check
git diff --check
```

Die lokale Ausführung schreibt ebenfalls die Binärdateien und aktualisiert `posts/_sources.json`.

## Quellenkatalog

Für jedes materialisierte Bild aktualisiert die Connection:

```text
posts/_sources.json
```

Beispiel:

```json
{
  "pacman-commons-iwatani-gdc": {
    "title": "Toru Iwatani, creator of Pac-Man, at GDC 2011.jpg",
    "publisher": "Wikimedia Commons",
    "url": "https://commons.wikimedia.org/wiki/File:Toru_Iwatani,_creator_of_Pac-Man,_at_GDC_2011.jpg",
    "accessed_at": "2026-09-24",
    "author": "Official GDC",
    "license": "CC BY 2.0",
    "license_url": "https://creativecommons.org/licenses/by/2.0"
  }
}
```

Die Commons-Metadaten sind die technische Quelle für Autor und Lizenz. Der Artikel verwendet die `source_id`, um die sichtbare Bildunterschrift mit dem Quellenkatalog zu verbinden.

## CI-Sicherheitsnetz

Unabhängig von der Photo Connection prüft:

```text
scripts/check-local-assets.js
```

die tatsächlich im Repository vorhandenen Bilder.

Der Check erkennt unter anderem:

- fehlende Dateien,
- 0-Byte-Bilder,
- ungültige JPEG-Signaturen,
- ungültige PNG-Signaturen,
- ungültige GIF-Signaturen,
- ungültige WebP-Signaturen,
- ungültige SVG-Inhalte,
- externe Hotlinks,
- fehlende Alt-Texte,
- Artikelbilder außerhalb von `/assets/posts/`.

Das ist bewusst eine zweite Schutzschicht. Auch ein manuell hinzugefügtes Bild muss diese Prüfung bestehen.

## Obsidian

### Repository direkt als Obsidian-Vault

Wenn das Repository direkt als Vault geöffnet ist, kann das Manifest normal unter `media/photos/` angelegt werden. Artikel und Manifest werden zusammen committed und gepusht.

### Self-hosted LiveSync / automatischer Publisher

Der LiveSync-Publisher muss für unterstützte Commons-Bilder kein Photo-Manifest mehr selbst erzeugen. Es reicht, wenn der veröffentlichte Markdown-Artikel den externen Commons-Bildlink enthält.

Sobald der Artikel auf einem `obsidian/**`-Branch landet, übernimmt `Materialize Article Photos` automatisch:

1. Hotlink erkennen,
2. Manifest erzeugen/erweitern,
3. Markdown auf den lokalen Pfad umschreiben,
4. Quellenlink ergänzen,
5. Bild über die bestehende Photo Connection laden und prüfen.

Eigene Fotos und Screenshots können weiterhin direkt unter `assets/posts/` gepflegt werden. Andere externe Bildprovider als Wikimedia Commons bleiben blockiert, bis ein lizenzbewusster Adapter existiert.

## Beispiel: Pac-Man

Der Pac-Man-Artikel verwendet die Connection für drei reale Bilder:

```text
assets/posts/pac-man-puck-man/
  04-arcade-machine.jpg
  05-toru-iwatani.jpg
  06-puck-man-handheld.jpg
```

Das Manifest:

```text
media/photos/pac-man-puck-man.json
```

Die Bilder stammen von Wikimedia Commons und werden mit den dort gemeldeten CC-Lizenzen materialisiert. Die selbst erstellten SVG-Diagramme des Artikels bleiben davon getrennt.

Damit besteht der Artikel aus:

```text
Pixabay-Cover
+
echten, lizenzierten Fotos über Photo Connection
+
eigenen erklärenden SVG-Diagrammen
```

## Troubleshooting

### `No changed article-photo manifest; nothing to materialize.`

Kein Fehler. Der Branch wurde aktualisiert, aber kein Manifest geändert. Der Workflow endet erfolgreich als No-op.

### `Commons file was not found`

Die angegebene `File:`-Seite existiert unter diesem Titel nicht mehr oder der Link zeigt nicht auf eine gültige Commons-Dateiseite.

Lösung:

- File-Seite im Browser prüfen,
- aktuellen Commons-Titel ins Manifest übernehmen,
- keine rohe `upload.wikimedia.org`-URL verwenden.

### `license changed`

Die aktuelle Commons-Lizenz stimmt nicht mehr mit `expected_license` überein.

Nicht einfach den erwarteten Wert anpassen. Zuerst auf Commons prüfen, warum sich die Metadaten unterscheiden.

### `unsupported or unclear license`

Die Datei hat keine Lizenz, die die Connection automatisch akzeptiert. Ein anderes Bild auswählen oder die Wiederverwendung außerhalb der automatischen Pipeline rechtlich/redaktionell klären.

### `downloaded image is suspiciously small`

Der Download hat keine plausible Bilddatei geliefert. Häufige Ursachen sind Fehlerseiten, abgebrochene Downloads oder falsche Quell-URLs.

Die Datei wird in diesem Fall **nicht committed**.

### Local Assets meldet `image file is empty`

Eine Datei existiert zwar im Git-Baum, enthält aber keine Bytes. Genau dieser Fehler trat bei der ersten Pac-Man-Fotoübernahme auf und wird heute blockiert.

### Local Assets meldet ungültige Magic Bytes

Dateiendung und tatsächlicher Dateiinhalt passen nicht zusammen oder die Datei ist beschädigt.

## Erweiterung um weitere Provider

Weitere Quellen werden als explizite Provider-Adapter implementiert.

Nicht vorgesehen ist ein generischer:

```text
source: https://irgendwo.example/bild.jpg
```

Downloader.

Ein neuer Provider muss mindestens liefern bzw. prüfen können:

- kanonische Quellseite,
- Autor/Uploader,
- Lizenz,
- direkte Bilddatei,
- MIME-Type,
- reproduzierbaren Download.

So bleibt die Sicherheits- und Lizenzgrenze auch bei späteren Erweiterungen erhalten.
