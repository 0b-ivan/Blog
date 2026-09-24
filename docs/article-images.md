# Bild-Policy für Blogartikel

Diese Policy gilt für Titelbilder und Inline-Abbildungen in Kernel Notes. Ziel ist, dass Bilder inhaltlich etwas beitragen, reproduzierbar ausgeliefert werden und auch in RSS, EPUB, PDF und der Artikelhistorie funktionieren.

## Standard beim Schreiben eines Artikels

Wenn ein Artikel von Bildern profitiert und nichts anderes vereinbart wurde, gilt:

- **Cover:** über die bestehende Pixabay-Pipeline erzeugen bzw. auswählen.
- **Inline-Bilder:** typischerweise 2–4 sinnvolle Abbildungen; nicht künstlich auffüllen.
- **Priorität:** eigenes Foto/Screenshot → reales, wiederverwendbares Drittbild → erklärende Grafik/Diagramm.
- Ein Bild muss mindestens eine Funktion erfüllen: belegen, erklären, vergleichen oder einen historischen/technischen Gegenstand konkret zeigen.
- Reine Dekoration, beliebige Stockfotos, Logos ohne Erklärwert und Screenshots von Text/Code nur als Lückenfüller vermeiden.

Bei historischen Themen sind echte Fotos, zeitgenössische Screenshots, Geräte-/Produktaufnahmen oder Dokumente grundsätzlich stärker als eine generische Illustration, sofern die Nutzung sauber geklärt ist.

## Was der Authoring-Brief enthalten sollte

Für einen Artikel mit Bildern reichen im Normalfall:

- Thema und gewünschter Schwerpunkt,
- gewünschte Bildanzahl, wenn sie vom Standard abweicht,
- erlaubte Bildquellen bzw. vorhandene eigene Bilder,
- besondere Anforderungen an Screenshots oder Fotos,
- Hinweis, falls EPUB/PDF nicht relevant sein sollte.

Wenn keine Quellenliste vorgegeben ist, gilt als Standard-Allowlist:

1. eigene Fotos und eigene Screenshots,
2. Pixabay,
3. Wikimedia Commons mit klar ausgewiesener Lizenz bzw. Wiederverwendungsbedingung,
4. offizielle Presse-/Medienassets nur dann, wenn deren Nutzungsbedingungen die geplante Verwendung abdecken.

Eine Google-Bildersuche oder irgendeine Fundstelle im Web ist **keine** Nutzungsfreigabe. Bei historischen Spiel-/Software-Screenshots oder anderem geschütztem Material muss die Wiederverwendung vor dem Commit separat geklärt werden; im Zweifel wird ein eigenes Screenshot, ein rechtsklarer Ersatz oder eine erklärende Grafik verwendet.

## Cover

Cover sind von Inline-Bildern getrennt:

```text
assets/covers/
```

Neue bzw. automatisch neu ausgewählte Cover kommen über die vorhandene Pixabay-Pipeline. Der Artikel beschreibt den gewünschten visuellen Inhalt über die Cover-Metadaten:

```yaml
cover_query:
cover_subject:
cover_avoid:
cover_intent:
```

Ein Cover-Briefing soll das **konkrete Motiv** beschreiben, nicht nur eine grobe Epoche oder Kategorie. Beispiel: Für einen Pac-Man-Artikel ist `maze arcade yellow character ghost chase` sinnvoller als nur `retro gaming 1980`.

## Inline-Bilder

Inline-Bilder werden lokal gespeichert:

```text
assets/posts/<asset-scope>/
```

`<asset-scope>` ist normalerweise ein kurzer, stabiler Themen-/Artikel-Slug. Eine zusammengehörige Serie darf sich bewusst einen gemeinsamen Scope teilen.

Beispiele:

```text
assets/posts/pac-man-puck-man/
  01-puck-man-cabinet.jpg
  02-gameplay.png
  03-toru-iwatani.jpg

assets/posts/k3s-proxmox-series/
  teil-i-architektur.svg
  teil-ii-architektur.svg
```

Im Markdown werden ausschließlich root-relative lokale Pfade verwendet:

```md
![Puck-Man-Arcade-Automat aus der frühen Veröffentlichung](/assets/posts/pac-man-puck-man/01-puck-man-cabinet.jpg)
```

Externe Hotlinks und Data-URIs sind in Artikeln nicht zulässig.

## Dateiformate

Für die Publikationspipeline gelten diese Präferenzen:

- **PNG:** Screenshots, Pixel-Art, UI, Diagramm-Rasterbilder.
- **JPEG/JPG:** Fotos.
- **SVG:** selbst erstellte Diagramme und schematische Abbildungen.
- **WebP:** nur wenn ein konkreter Grund besteht und die Export-Kompatibilität geprüft wurde.

Reale Fotos oder Screenshots werden nicht künstlich in SVG-Wrapper gepackt. Bilder werden nicht hochskaliert, nur um eine Zielgröße zu erreichen.

## Dateinamen

Inline-Bilder bekommen kurze, sprechende und stabile Namen. Bei mehreren Abbildungen ist eine Reihenfolge hilfreich:

```text
01-puck-man-cabinet.jpg
02-gameplay.png
03-toru-iwatani.jpg
```

Keine Dateinamen wie `IMG_4837.jpg`, `Screenshot 2026-09-24.png` oder zufällige UUIDs.

## Alt-Text und Bildunterschrift

Jedes Inline-Bild braucht einen aussagekräftigen Alt-Text. Der Alt-Text beschreibt, **was auf dem Bild relevant ist**, nicht nur „Bild“ oder den Dateinamen.

Bei erklärungsbedürftigen oder fremden Bildern folgt direkt darunter eine kurze Bildunterschrift, zum Beispiel:

```md
![Puck-Man-Arcade-Automat](/assets/posts/pac-man-puck-man/01-puck-man-cabinet.jpg)

*Abb. 1: Früher Puck-Man-Automat. Quelle: [Wikimedia Commons](/sources.html#pacman-puckman-cabinet).*
```

Eigene Screenshots/Fotos können als `Eigener Screenshot` bzw. `Eigenes Foto` bezeichnet werden.

## Quellen und Credits

Fremde Inline-Bilder werden nicht nur lokal gespeichert, sondern erhalten einen nachvollziehbaren Quellen-/Lizenznachweis in:

```text
posts/_sources.json
```

Die Quellen-ID wird aus der Bildunterschrift über `/sources.html#<id>` referenziert. Mindestens festhalten:

- Titel/Beschreibung,
- Urheber bzw. Uploader, sofern vorhanden,
- Quelle/Publisher,
- Original-URL,
- Lizenz bzw. Wiederverwendungsbedingung,
- Abrufdatum, wenn sinnvoll.

Die lokale Datei ersetzt nicht den Herkunftsnachweis.

## Photo Connection

Rechteklare Drittbilder werden über die **Photo Connection** materialisiert statt manuell als Binärdaten durch Chat-, Browser- oder GitHub-Clients kopiert zu werden.

Kurzfassung:

- Manifest unter `media/photos/<asset-scope>.json`
- aktuell unterstützter Provider: Wikimedia Commons
- automatische Prüfung von Quelle, Lizenz, MIME-Type, Größe und Magic Bytes
- Ausgabe ausschließlich unter `assets/posts/`
- automatische Aktualisierung von `posts/_sources.json`
- Materialisierung auf demselben Feature-/Artikel-Branch vor dem Merge

Die vollständige Authoring-, Betriebs- und Troubleshooting-Doku steht in [`docs/photo-connection.md`](photo-connection.md).

## CI-Regeln

`scripts/check-local-assets.js` prüft für aktive und archivierte Artikel:

- jedes Markdown-Bild hat einen nichtleeren Alt-Text,
- Artikelbilder sind lokal und root-relativ unter `/assets/posts/`,
- externe Bild-Hotlinks/Data-URIs werden abgelehnt,
- referenzierte lokale Dateien existieren.

Damit bleibt die Policy auch bei Obsidian-, manuellen und automatisierten Artikeländerungen durchgesetzt.

## Review-Checkliste

Vor dem Merge eines Artikels mit Bildern:

- Passt das Cover konkret zum Thema?
- Trägt jede Inline-Abbildung etwas zum Verständnis bei?
- Wurde ein reales Bild/Screenshot bevorzugt, wenn es stärker als eine Schema-Grafik ist?
- Sind alle Dateien lokal unter `assets/posts/<asset-scope>/`?
- Haben alle Bilder sinnvolle Alt-Texte?
- Sind fremde Bilder mit Quelle und Lizenz dokumentiert?
- Funktionieren Website, RSS, EPUB und PDF?
- Bleiben die Bilder auch in der Artikelhistorie reproduzierbar?
