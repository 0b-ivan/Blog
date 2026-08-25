# Obsidian Search Regression Queries

Neue oder geaenderte Artikel brauchen kein manuell gepflegtes Regression-JSON mehr.
Der Obsidian Publisher verwaltet die Datei unter `rag/regression/cases/` zusammen mit dem Artikel.

Ohne weitere Angaben verwendet der Publisher den Artikeltitel als einfachen Regressionstest.
Bestehende, bereits manuell gepflegte Fixtures bleiben dabei unveraendert.

Fuer bessere Suchtests koennen im Frontmatter eigene Fragen hinterlegt werden:

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

Bei `status: draft` entfernt der Publisher die Regression zusammen mit dem Artikel.
Bei `status: archived` bleibt die Regression erhalten.
