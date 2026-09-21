# Analytics und Leserinteraktion

Kernel Notes verwendet keine Drittanbieter-Webanalyse. Artikelmetriken werden über einen eigenen Analytics-Dienst innerhalb der selbst gehosteten Infrastruktur verarbeitet.

## Sichtbare Artikelinformationen

Auf Artikelseiten werden bewusst nur zwei aggregierte Kennzahlen prominent angezeigt:

- Aufrufe
- Likes

Die frühere Darstellung von durchschnittlicher aktiver Lesezeit und Abschlussquote direkt im Artikelkopf wurde entfernt. Diese Werte sind für die inhaltliche Qualitätsanalyse nützlich, aber für Leser im Header schwer einzuordnen.

Tooltips erklären die sichtbaren Kennzahlen bei Hover, Tastaturfokus oder Tap.

## Lesefortschritt

Der sichtbare Lesefortschritt wird ausschließlich im Browser aus der Position des Artikelinhalts berechnet. Zu Beginn erscheint er als dezente, schmale Anzeige links unten. Nach kurzem Scrollen schrumpft die Anzeige zu einer kleinen Bubble. Die Prozentzahl bleibt mittig sichtbar, während sich die Bubble von unten nach oben entsprechend dem Lesefortschritt füllt. Ein Tap oder Klick auf die Bubble klappt die vollständige Anzeige wieder auf; ein weiterer Tap klappt sie wieder ein. Sobald das Artikelende beziehungsweise der Feedback-Bereich erreicht ist, blendet die Anzeige aus. Dadurch konkurriert sie weder mit der Navigation noch dauerhaft mit dem Artikelinhalt. Die Fortschrittsanzeige selbst benötigt keinen persistenten Benutzerzustand.

Für die aggregierte Qualitätsanalyse meldet der Browser weiterhin die erreichten Scrollstufen 25, 50, 75, 90 und 100 Prozent an den eigenen Analytics-Dienst.

## Likes

Ein Like erhöht den aggregierten Zähler des Artikels. Der Browser speichert zusätzlich den Schlüssel

```text
kernel-notes:liked:<slug>
```

im Local Storage, damit derselbe Browser nicht versehentlich mehrfach liked. Das ist bewusst keine starke Identitätssperre: Website-Daten können gelöscht werden und es gibt keine geräteübergreifende Besucher-ID.

## Favoriten

Favoriten sind eine reine Browser-Funktion. Die Slugs gespeicherter Artikel liegen als JSON-Liste unter

```text
kernel-notes:favorites
```

im Local Storage. Diese Liste wird nicht an den Blog- oder Analytics-Dienst übertragen. Ohne Browser-Synchronisierung beziehungsweise Benutzerkonto sind Favoriten deshalb geräte- und browserbezogen.

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
