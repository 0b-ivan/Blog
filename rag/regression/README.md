# Kernel Grep Search Regression

Die Regressionstests pruefen die reale semantische Suche gegen die aktiven Blogposts.

## Neuer Blogpost

Jeder aktive Post unter `posts/*.md` braucht mindestens eine echte Suchfrage direkt im Frontmatter unter `search_queries`.

Beispiel:

```yaml
search_queries:
  - query: "Eine echte Frage, die inhaltlich zu diesem Artikel fuehren soll"
    maxRank: 1
  - query: "Eine bewusst etwas mehrdeutige Frage"
    maxRank: 3
```

Die CI liest diese Angaben direkt aus der Markdown-Datei. Es gibt keine zusaetzliche positive Regression-JSON-Datei pro Artikel mehr.

`maxRank` ist optional und standardmaessig `1`. Erlaubt sind Werte von `1` bis `12`. Fuer bewusst mehrdeutige Anfragen kann zum Beispiel `2` oder `3` verwendet werden.

Alternativ ist eine einfache Liste moeglich. Dann gilt fuer jeden Eintrag `maxRank: 1`:

```yaml
search_queries:
  - Wie kann ich Dwarf Fortress im Browser spielen?
  - Kann ich Dwarf Fortress ueber Proxmox streamen?
```

Die Testfrage sollte moeglichst nicht einfach den Artikeltitel wiederholen. Gute Faelle beschreiben ein Problem oder eine Absicht in anderen Worten.

Fehlt `search_queries` bei einem aktiven Artikel, wird der Regressionstest rot. Es gibt bewusst keinen automatischen Titel-Fallback.

## Negative Suchanfragen

`cases/_no-results.json` bleibt als einzige separate Regression-Datei erhalten. Sie enthaelt Anfragen, fuer die Kernel Grep keinen Treffer liefern soll.

## Archivierte Posts

Archivierte Artikel behalten ihre `search_queries` direkt im Markdown unter `archive/*.md`. Solange ein Artikel archiviert ist, wird sein Ranking nicht gegen den aktiven Suchindex getestet. Wird er wieder nach `posts/` veroeffentlicht, werden dieselben Regression-Fragen automatisch wieder aktiv.

## Lokal ausfuehren

```bash
npm install --prefix rag --package-lock=false
npm run rag:test:regression
```

Der Regressionstest nutzt standardmaessig dasselbe E5-Modell wie Production (`Xenova/multilingual-e5-small`). Das Modell wird im lokalen Cache wiederverwendet.

Die schnellen Unit-Tests bleiben davon getrennt:

```bash
npm run rag:test
```
