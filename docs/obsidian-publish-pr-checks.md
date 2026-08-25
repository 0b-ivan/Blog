# Obsidian Publish PR Checks

Der Obsidian Publisher erstellt weiterhin einen eigenen PR pro Artikel.
Die Checks behandeln Abhaengigkeiten zwischen diesen PRs jetzt ohne tote Links oder unnoetige Folgefehler.

- Wiki-Links auf bereits veroeffentlichte Artikel werden normal verlinkt.
- Wiki-Links auf noch nicht veroeffentlichte Artikel bleiben im gerenderten Blog normaler Text und erzeugen im Reference Check nur eine Warnung.
- Neue Artikel erhalten automatisch ein Semantic-Search-Regression-Fixture.
- Eigene Suchfragen koennen ueber `search_queries` im Frontmatter gepflegt werden.
- Bereits vorhandene kuratierte Fixtures bleiben erhalten, solange kein `search_queries` gesetzt wird.
- Bei `status: draft` wird das Fixture zusammen mit dem Artikel entfernt.
- Bei `status: archived` bleibt das Fixture bestehen.
- Fehlt trotzdem ein Fixture, meldet der Coverage-Test den fehlenden Artikel, ohne danach mit `fixture.queries` abzustuerzen.
