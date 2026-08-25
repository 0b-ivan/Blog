# Obsidian Publish PR Checks

Der Obsidian Publisher erstellt weiterhin einen eigenen PR pro Artikel.
Die Checks behandeln Abhaengigkeiten zwischen diesen PRs ohne tote Links oder unnoetige Folgefehler.

- Wiki-Links auf bereits veroeffentlichte Artikel werden normal verlinkt.
- Wiki-Links auf noch nicht veroeffentlichte Artikel bleiben im gerenderten Blog normaler Text und erzeugen im Reference Check nur eine Warnung.
- Positive Semantic-Search-Regressionen stehen direkt als `search_queries` im Frontmatter des Artikels.
- Jeder aktive Artikel braucht mindestens eine Regression-Frage; fehlt sie, blockiert der Coverage-Test den PR.
- Es gibt keinen automatischen Titel-Fallback und keine positive per-Artikel-Regression-JSON-Datei mehr.
- `rag/regression/cases/_no-results.json` bleibt fuer negative Suchfaelle bestehen, die keinem Artikel zugeordnet sind.
- Bei `status: draft` ist der Artikel nicht im aktiven Suchindex und seine Regression wird nicht ausgefuehrt.
- Bei `status: archived` bleiben die `search_queries` im archivierten Markdown erhalten und werden nach einer Wiederveroeffentlichung wieder aktiv.
