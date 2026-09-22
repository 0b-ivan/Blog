# Analytics und Leserinteraktion

Kernel Notes verwendet keine Drittanbieter-Webanalyse. Artikelmetriken werden über einen eigenen Analytics-Dienst innerhalb der selbst gehosteten Infrastruktur verarbeitet.

## Sichtbare Artikelinformationen

Auf Artikelseiten werden bewusst nur zwei aggregierte Kennzahlen prominent angezeigt:

- Aufrufe
- Likes

Die frühere Darstellung von durchschnittlicher aktiver Lesezeit und Abschlussquote direkt im Artikelkopf wurde entfernt. Diese Werte sind für die inhaltliche Qualitätsanalyse nützlich, aber für Leser im Header schwer einzuordnen.

Tooltips erklären die sichtbaren Kennzahlen bei Hover, Tastaturfokus oder Tap.

## Lesefortschritt

Der sichtbare Lesefortschritt wird ausschließlich im Browser aus der Position des Artikelinhalts berechnet. Zu Beginn erscheint er als dezente, schmale Anzeige rechts unten. Nach kurzem Scrollen schrumpft die Anzeige zu einer kleinen Bubble von rund 44 Pixeln. Der Flüssigkeitsstand steigt mit dem Lesefortschritt und wechselt kontinuierlich von Rot über Gelb zu Grün. Auf kleinen Viewports lässt sich die kompakte Bubble per Pointer oder Touch verschieben und rastet beim Loslassen am nächsten Seitenrand ein; nur diese UI-Position wird lokal im Browser gespeichert. Ein Tap oder Klick ohne Ziehen klappt die vollständige Anzeige wieder auf. Für den Abschluss wird zusätzlich die selbst gehostete Rive-Web-Runtime mit dem CC-BY-Beispiel `liquid_download.riv` verwendet; Runtime, WASM und Asset werden vom Blog selbst ausgeliefert. Die Rive-Runtime wird nicht beim Artikelaufruf geladen, sondern erst ab etwa 75 Prozent Lesefortschritt vorgewärmt. Beim Erreichen von 100 Prozent wird die Bubble grün und spielt die Rive-Abschlusssequenz, während lokale Flüssigkeitstropfen nach außen spritzen und transparente Drips kurz über den direkt darunterliegenden Inhalt laufen. Gleichzeitig kehrt der ursprüngliche Abschluss-Burst mit unterschiedlich großen Daumen-Emojis und einem Fragezeichen zurück und schwebt nach oben aus. Bei aktivierter Einstellung für reduzierte Bewegung wird die Abschlussanimation ausgelassen. Die Asset-Attribution steht unter `assets/rive/README.md`.

Für die aggregierte Qualitätsanalyse meldet der Browser weiterhin die erreichten Scrollstufen 25, 50, 75, 90 und 100 Prozent an den eigenen Analytics-Dienst.

## Likes

Ein Like erhöht den aggregierten Zähler des Artikels. Der Browser speichert zusätzlich den Schlüssel

```text
kernel-notes:liked:<slug>
```

im Local Storage, damit derselbe Browser nicht versehentlich mehrfach liked. Das ist bewusst keine starke Identitätssperre: Website-Daten können gelöscht werden und es gibt keine geräteübergreifende Besucher-ID.

## Artikel herunterladen

Die frühere lokale Favoritenfunktion wurde durch einen Download-Dialog ersetzt. Leser können den aktuellen Artikel als EPUB oder PDF herunterladen.

Das EPUB wird direkt aus dem veröffentlichten Artikel erzeugt und enthält Buchmetadaten, Autor, Herausgeber, Titelseite, Inhaltsverzeichnis, Artikelinhalt, Quellenlink und ein Cover. Ist für den Artikel ein lokales Cover gesetzt, wird dieses Bild als Grundlage für das Buchcover verwendet; andernfalls erzeugt Kernel Notes ein deterministisches Fallback-Cover. Der PDF-Download wird aus demselben EPUB erzeugt, damit Inhalt und Cover in beiden Formaten übereinstimmen.

Coverbilder können redaktionell über die Pixabay-Suche ausgewählt werden. Die Suche läuft nur beim Bearbeiten eines Artikels über `PIXABAY_API_KEY`; ausgewählte Bilder werden anschließend unter `assets/covers/` lokal gespeichert. Besucher laden daher weder das Cover noch API-Ressourcen direkt von Pixabay.

## Teilen

Die Teilen-Funktion verwendet nach Möglichkeit die Web Share API des Browsers. Ist sie nicht verfügbar, wird der Artikellink in die Zwischenablage kopiert. Es wird kein eigener Social-Media-Dienst und kein Drittanbieter-SDK geladen.

## Analytics-Ereignisse

Der Browser sendet nur die für die Aggregation notwendigen Ereignisse:

- `article_view`
- `article_active`
- `article_scroll`
- Like über den dedizierten Like-Endpunkt
- Suchereignisse von Kernel Grep

Der Blog ergänzt dabei keine dauerhafte Besucher-ID, kein Fingerprinting und keine Geolocation. Der Analytics-Dienst speichert Artikelwerte aggregiert und Suchstatistiken tageweise. Die tägliche Aufbewahrung wird über `ANALYTICS_RETENTION_DAYS` gesteuert und liegt aktuell bei 90 Tagen.

## Laufzeitpfad

```text
Browser
  |
  | /api/analytics/*
  v
Blog / privacy-server.js
  |
  | internes Service-Netz
  v
analytics-server.js
  |
  v
persistenter Analytics-Speicher
```

Der Browser kennt die interne Service-Adresse nicht. Das öffentliche Dashboard bleibt token-geschützt.

## Datenschutz

Die technische und rechtliche Beschreibung für Besucher steht zusätzlich in `datenschutz.html`. Änderungen an Analytics, Local Storage oder der erhobenen Semantik müssen zusammen mit dieser Dokumentation und den Datenschutzhinweisen aktualisiert werden.
