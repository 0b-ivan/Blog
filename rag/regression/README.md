# Kernel Grep Search Regression

Die Regressionstests pruefen die reale semantische Suche gegen die aktiven Blogposts.

## Neuer Blogpost

Jeder aktive Post unter `posts/*.md` braucht eine gleichnamige JSON-Datei unter `rag/regression/cases/`.

Beispiel fuer:

```text
posts/2026-08-24-mein-neuer-post.md
```

wird:

```text
rag/regression/cases/2026-08-24-mein-neuer-post.json
```

mit mindestens einer Suchanfrage:

```json
{
  "post": "2026-08-24-mein-neuer-post",
  "queries": [
    {
      "query": "Eine echte Frage, die inhaltlich zu diesem Artikel fuehren soll",
      "maxRank": 1
    }
  ]
}
```

`maxRank` ist optional und standardmaessig `1`. Fuer bewusst mehrdeutige Anfragen kann z. B. `2` oder `3` verwendet werden.

Die Testfrage sollte moeglichst nicht einfach den Artikeltitel wiederholen. Gute Faelle beschreiben ein Problem oder eine Absicht in anderen Worten.

## Negative Suchanfragen

`cases/_no-results.json` enthaelt Anfragen, fuer die Kernel Grep keinen Treffer liefern soll.

## Archivierte Posts

Eine Regression-Datei darf fuer einen archivierten Post bestehen bleiben. Solange der Post nur unter `archive/` liegt, wird sein Ranking nicht gegen den aktiven Suchindex getestet. Wird der Post wiederhergestellt, wird seine Regression automatisch wieder aktiv.

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
