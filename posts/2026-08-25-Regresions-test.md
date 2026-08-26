---
id: 2026-08-25-regressionstests-was-sie-sind-und-wie-ich-sie-nutze
version: 1
title: Regressionstests – was sie sind und wie ich sie nutze
date: 2026-08-25
created_at: 2026-08-25
updated_at: 2026-08-25
author: obivan
reviewed_by: pending
category: Development
status: publish
excerpt: Regressionstests prüfen, ob Dinge, die gestern funktioniert haben, nach einer Änderung immer noch funktionieren. In meinem Blog nutze ich sie unter anderem für die semantische Suche Kernel Grep.
tags:
  - Testing
  - Regressionstest
  - CI
  - GitHub-Actions
  - Semantic-Search
  - Kernel-Grep
  - Obsidian
search_queries:
  - query: Was ist ein Regressionstest?
    maxRank: 1
  - query: Wie prüfe ich mit Regressionstests ob nach einer Änderung bisheriges Verhalten noch funktioniert?
    maxRank: 3
  - query: Wie teste ich eine semantische Suche automatisch?
    maxRank: 3
---

Bei Tests denkt man schnell an die Frage:

> Funktioniert mein neuer Code?

Ein **Regressionstest** stellt aber noch eine zweite, mindestens genauso wichtige Frage:

> Funktioniert das, was vorher funktioniert hat, danach immer noch?

Genau darum geht es bei Regressionstests.

Ich nutze sie mittlerweile auch in diesem Blog. Besonders interessant wird das bei meiner semantischen Suche **Kernel Grep**, weil sich dort das Verhalten nicht so einfach mit einem klassischen `true` oder `false` überprüfen lässt.

## Das eigentliche Problem

Angenommen, meine Suche liefert für:

```text
Wie kann ich Dwarf Fortress im Browser spielen?
```

den Artikel:

```text
Dwarf Fortress im Browser – mit Proxmox, Authentik und Cloudflare Zero Trust
```

Das ist das Ergebnis, das ich erwarte.

Jetzt ändere ich später etwas:

- das Embedding-Modell
- die Chunk-Größe
- das Ranking
- die Gewichtung von semantischer und klassischer Suche
- die Texte eines Artikels
- die Indexierung

Die Anwendung startet danach vielleicht weiterhin problemlos.

Alle Unit-Tests sind grün.

Aber plötzlich landet der Dwarf-Fortress-Artikel bei derselben Suche nur noch auf Platz 8.

Technisch funktioniert die Suche weiterhin.

Qualitativ ist sie aber schlechter geworden.

Genau so etwas soll ein Regressionstest erkennen.

## Regression bedeutet nicht automatisch Fehler

Der Name kommt daher, dass wir eine **Regression** erkennen wollen.

Also vereinfacht:

```mermaid
flowchart TD
    A[Bekanntes Verhalten funktioniert] --> B[Code oder Konfiguration wird geändert]
    B --> C{Regressionstest}
    C -->|grün| D[Verhalten weiterhin korrekt]
    C -->|rot| E[Regression erkannt]
```

Ein Regressionstest hält bekanntes Verhalten fest und überprüft es nach zukünftigen Änderungen erneut.

Ein einfaches Beispiel wäre:

```js
expect(add(2, 2)).toBe(4);
```

Wenn ich später die Implementierung von `add()` ändere und plötzlich `5` herauskommt, erkennt der Test die Regression.

Bei einer semantischen Suche ist das schwieriger.

Dort teste ich nicht unbedingt:

```text
Ergebnis = exakt X
```

sondern eher:

```text
Artikel X muss unter den ersten N Ergebnissen auftauchen.
```

## So mache ich das bei Kernel Grep

Für Artikel kann ich direkt im Frontmatter Testfragen hinterlegen.

Zum Beispiel:

```yaml
search_queries:
- query: "Wie kann ich Dwarf Fortress im Browser spielen?"
  maxRank: 1

- query: "Wie funktioniert Dwarf Fortress mit Proxmox?"
  maxRank: 3
```

Damit beschreibe ich meine Erwartung.

Die erste Frage bedeutet:

```text
Der Artikel muss auf Platz 1 landen.
```

Die zweite:

```text
Der Artikel muss mindestens unter den ersten 3 Ergebnissen sein.
```

Das ist deutlich sinnvoller, als nur nach dem Artikeltitel zu suchen.

Denn ein Nutzer wird wahrscheinlich nicht eingeben:

```text
Dwarf Fortress im Browser – mit Proxmox, Authentik und Cloudflare Zero Trust
```

Er fragt eher:

```text
Wie kann ich Dwarf Fortress im Browser spielen?
```

oder:

```text
Kann ich Dwarf Fortress über Proxmox streamen?
```

Genau diese realistischen Fragen möchte ich testen.

## Was bedeutet `maxRank`?

Nehmen wir diesen Test:

```yaml
- query: "Wie teste ich eine semantische Suche?"
  maxRank: 3
```

Kernel Grep könnte beispielsweise liefern:

```text
1. Semantische Suche für meinen Blog
2. Wie dieser Blog gebaut ist
3. Regressionstests – was sie sind und wie ich sie nutze
```

Der Test ist noch erfolgreich.

Mein Artikel befindet sich auf Position 3 und damit innerhalb von:

```text
maxRank: 3
```

Landet er dagegen auf Position 4, wird der Regressionstest rot.

Das ist ein Signal:

```text
Irgendetwas hat das Suchverhalten verändert.
```

Nicht jede Veränderung ist automatisch ein Bug. Aber sie muss zumindest bewusst geprüft werden.

## Die Tests laufen automatisch

Ich möchte nicht bei jedem Artikel zusätzlich irgendwelche JSON-Dateien pflegen.

Deshalb bleibt die Testdefinition direkt beim Artikel. Die CI liest `search_queries` aus dem Frontmatter der Markdown-Datei und führt diese Fragen gegen den aktuellen Kernel-Grep-Index aus.

Aus:

```yaml
search_queries:
- query: "Was ist ein Regressionstest?"
  maxRank: 1
```

wird also keine zweite per-Artikel-Datei mehr erzeugt.

Der Artikel selbst ist die Quelle der Wahrheit:

```text
posts/artikel.md
   │
   ├── Inhalt
   ├── Metadaten
   └── search_queries
          │
          ▼
Semantic-Search-Regression
```

Nur negative Suchfälle liegen separat unter:

```text
rag/regression/cases/_no-results.json
```

Das sind Fragen, für die bewusst **kein** Artikel zurückgegeben werden soll.

Beim Pull Request läuft die CI dagegen.

Das Prinzip ist:

```mermaid
flowchart TD
    A[Artikel in Obsidian ändern] --> B[Obsidian Publisher]
    B --> C[Pull Request]
    C --> D[CI liest search_queries aus Markdown]
    D --> E[Kernel-Grep-Index aufbauen]
    E --> F[Testfragen ausführen]
    F --> G[Ranking überprüfen]
    G --> H{Erwarteter maxRank erreicht?}
    H -->|Ja| I[CI grün]
    H -->|Nein| J[CI rot]
```

Damit wird die Suchqualität Teil meiner normalen CI, ohne dass Artikel und Testdefinition auseinanderlaufen können.

## Warum reicht ein Unit-Test nicht?

Unit-Tests und Regressionstests überschneiden sich durchaus.

Sie verfolgen aber oft einen anderen Blickwinkel.

Ein Unit-Test könnte beispielsweise prüfen:

```text
Berechnet cosineSimilarity() den richtigen Wert?
```

Oder:

```text
Kann ein Artikel korrekt in Chunks zerlegt werden?
```

Das sind wichtige Tests.

Aber alle diese Komponenten können einzeln korrekt funktionieren und gemeinsam trotzdem schlechtere Suchergebnisse erzeugen.

Der Regressionstest schaut deshalb auf das Verhalten des Gesamtsystems.

```mermaid
flowchart LR
    A[Suchfrage] --> B[Embedding]
    B --> C[Vektorsuche]
    C --> D[Lexikalisches Ranking]
    D --> E[Relevanzfilter]
    E --> F[Suchergebnis]
```

Er prüft eher:

> Kommt am Ende weiterhin das heraus, was ich erwarte?

## Ein Fehler, den ich selbst gemacht habe

Anfangs lagen die Regression-Fragen in separaten JSON-Fixtures unter `rag/regression/cases/`.

Damit hatte jeder Artikel zwei Stellen, die zusammenpassen mussten:

```text
posts/artikel.md
rag/regression/cases/artikel.json
```

Die CI konnte zwar prüfen, ob für jeden aktiven Artikel ein Fixture existiert. Trotzdem blieb ein grundsätzliches Problem: Artikel und Fixture konnten auseinanderlaufen.

Bei einem fehlenden Fixture entstand früher zusätzlich ein Folgefehler, weil ein weiterer Test trotzdem auf:

```js
fixture.queries
```

zugreifen wollte.

Das Resultat war neben der eigentlichen Meldung:

```text
Cannot read properties of undefined
```

Der Folgefehler ließ sich zwar mit einem Guard verhindern. Sauberer war aber, die doppelte Datenhaltung ganz zu entfernen.

Heute liest der Regressionstest die Fragen direkt aus dem Frontmatter. Damit gibt es für einen positiven Suchfall nur noch eine Quelle der Wahrheit.

## Was passiert bei neuen Artikeln?

Jeder veröffentlichte Artikel braucht mindestens eine echte Regression-Frage im Frontmatter.

Zum Beispiel:

```yaml
search_queries:
- query: "Was ist ein Regressionstest?"
  maxRank: 1
- query: "Wofür brauche ich Regressionstests?"
  maxRank: 3
```

Fehlt `search_queries`, wird nicht stillschweigend der Artikeltitel als Ersatz verwendet. Die CI wird stattdessen rot und meldet, welcher aktive Artikel noch keine Regression-Frage besitzt.

Das ist absichtlich streng. Ein Titel als Suchfrage würde zwar leicht einen grünen Test erzeugen, aber kaum prüfen, ob die semantische Suche eine echte Nutzerfrage versteht.

## Was passiert beim Archivieren oder Löschen?

Auch der Lifecycle eines Artikels gehört dazu.

Bei:

```yaml
status: draft
```

wird der Artikel nicht veröffentlicht und gehört damit nicht zum aktiven Suchindex. Die `search_queries` können im Obsidian-Dokument erhalten bleiben, werden aber nicht gegen den öffentlichen Index getestet.

Bei:

```yaml
status: archived
```

bleibt der Artikel unter `archive/` erhalten. Seine `search_queries` bleiben Teil des Artikels, werden aber nicht gegen den aktiven Suchindex ausgeführt. Wird der Artikel wieder veröffentlicht, werden dieselben Tests automatisch wieder aktiv.

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Published: status = publish
    Published --> Archived: status = archived
    Archived --> Published: status = publish
    Published --> Draft: status = draft
    Archived --> Draft: status = draft

    state Draft {
        [*] --> NichtOeffentlich
        NichtOeffentlich: Artikel nicht öffentlich
        NichtOeffentlich: Regression nicht aktiv
    }

    state Published {
        [*] --> Aktiv
        Aktiv: Artikel aktiv
        Aktiv: search_queries werden getestet
    }

    state Archived {
        [*] --> Archiviert
        Archiviert: Artikel archiviert
        Archiviert: search_queries bleiben erhalten
    }
```

## Fazit

Ein Regressionstest beantwortet im Kern eine einfache Frage:

> Funktioniert das, was bisher funktioniert hat, nach meiner Änderung immer noch?

Bei klassischem Code kann das ein konkreter Rückgabewert sein.

Bei meiner semantischen Suche ist es ein erwartetes Suchergebnis.

Mit:

```yaml
search_queries:
- query: "Was ist ein Regressionstest?"
  maxRank: 1
```

kann ich diese Erwartung direkt beim Artikel dokumentieren.

Die CI liest dieselbe Markdown-Datei und führt die Suchfrage automatisch aus. Eine zusätzliche positive Regression-Datei muss nicht synchron gehalten werden.

Damit wird aus:

```text
Ich glaube, die Suche funktioniert noch.
```

ein:

```text
Ich habe geprüft, dass die bekannten Suchfälle weiterhin funktionieren.
```

Und genau dafür sind Regressionstests ziemlich praktisch.

## Querverweise

- [[kernel-grep-semantische-suche-fuer-meinen-blog|Kernel Grep – semantische Suche für meinen Blog]]
- [[wie-dieser-blog-gebaut-ist|Wie dieser Blog gebaut ist]]
- [[markdown-features-im-blog|Markdown-Features im Blog nutzen]]

## Quellen

- [GitHub Actions Dokumentation](/sources.html#github-actions-docs)
- [multilingual-e5-small Model Card](/sources.html#e5-multilingual-small)
- [Transformers.js Dokumentation](/sources.html#transformers-js)
- [DuckDB Node.js Client](/sources.html#duckdb-node-neo)
