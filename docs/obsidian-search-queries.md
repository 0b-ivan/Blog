# Obsidian Search Regression Queries

Die Such-Regression gehoert direkt zum Artikel. `search_queries` im Markdown-Frontmatter ist die einzige Quelle fuer positive Regressionstests.

Der Obsidian Publisher veroeffentlicht die Markdown-Datei unveraendert. Er erzeugt keine zusaetzliche per-Artikel-Datei unter `rag/regression/cases/` mehr.

Jeder Artikel mit `status: publish` braucht mindestens eine Regression-Frage:

```yaml
search_queries:
  - query: "Wie kann ich Dwarf Fortress im Browser spielen?"
    maxRank: 1
  - query: "Wie funktioniert Dwarf Fortress mit Proxmox?"
    maxRank: 3
```

Alternativ reicht auch eine einfache Liste. Dann gilt `maxRank: 1`:

```yaml
search_queries:
  - Wie kann ich Dwarf Fortress im Browser spielen?
  - Dwarf Fortress ueber Proxmox streamen
```

`maxRank` darf zwischen `1` und `12` liegen.

Es gibt bewusst keinen Artikeltitel als automatischen Fallback. Fehlt `search_queries` bei einem aktiven Artikel, blockiert die CI den Pull Request. Damit pruefen die Regressionstests echte Nutzerfragen statt nur leicht zu bestehende Titelsuchen.

Negative Suchfaelle bleiben separat in `rag/regression/cases/_no-results.json`, weil sie keinem einzelnen Artikel zugeordnet sind.

Bei `status: draft` ist der Artikel nicht Teil des aktiven Suchindex und seine Regression wird nicht ausgefuehrt. Bei `status: archived` bleiben die `search_queries` im archivierten Markdown erhalten; nach einer spaeteren Wiederveroeffentlichung werden sie automatisch wieder aktiv.
