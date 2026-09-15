# Snippets beim Publizieren pflegen

Die Code-Dateien liegen unter `snippets/<artikel-slug>/`. Titel und Beschreibung
werden direkt im YAML-Frontmatter des Artikels gepflegt, auch beim Publizieren
über Obsidian:

```yaml
snippets:
  - file: 02-updates-und-rollbacks.yml
    title: Blog-Image auf einen festen Stand setzen
    description: Zeigt einen festen Image-Tag für den Blog-Service.
    type: Compose-Ausschnitt
    language: yaml
```

Nur `file` ist erforderlich. Der Pfad ist relativ zum Snippet-Verzeichnis des
Artikels. Er bleibt stabil, wenn sich der Titel ändert. `description` ist ein
kurzer Satz zum Zweck; `type` die sichtbare fachliche Bezeichnung, etwa
Shellskript, Compose-Ausschnitt oder systemd-Unit. `language` steuert nur die
Syntaxhervorhebung (z. B. bash, yaml, ini). Eine `.sh`-Datei wird standardmäßig
als Shellskript bezeichnet; YAML allein wird nicht als Compose interpretiert.

Im Artikel bleibt der bestehende Markdown-Link erhalten:

```markdown
[Blog-Image auf einen festen Stand setzen](/snippets/2026-08-19-deployment-mit-hetzner-docker-und-cloudflare-zero-trust/02-updates-und-rollbacks.yml "snippet:yaml")
```

Artikelansicht und Bibliothek verwenden dieselben aufgelösten Metadaten.
Auch vorhandene Zeilenbereiche (`snippet:yaml:2-5`) funktionieren weiter.
Die Bibliothek zeigt die vollständige referenzierte Datei, die selbst ein
Ausschnitt sein kann. Download und Raw-Link bleiben unverändert.

## Alte Artikel und Priorität

Pro Feld gilt: Frontmatter → altes `snippets/manifest.json` → Markdown-Link →
Dateiname/Format. `description` übernimmt als Altbestand `usage`.
`description: ""` blendet die Beschreibung ausdrücklich aus. Fehlende
Beschreibungen werden nicht aus Dateinamen erfunden. Ein Frontmatter-Block
ersetzt nicht automatisch andere alte Einträge desselben Artikels.

Das Manifest bleibt als Kompatibilitätsquelle erhalten. Neue Metadaten gehören
in den Artikel. Die Bibliothek berücksichtigt nur Einträge zu vorhandenen
Artikeln unter `posts/`. Die drei Fail2ban-Dateien und das FreshRSS-Beispiel
haben derzeit keinen zugehörigen Artikel und bleiben deshalb ausgeblendet;
ihre alten Raw-URLs bleiben erhalten.

## Prüfen und neue Dateien

`npm run posts:validate-meta` prüft auch Snippet-Felder, doppelte Zuordnungen,
ungültige Pfade und fehlende Dateien. Frontmatter-Texte werden als Text
angezeigt, nicht als HTML interpretiert.

Der Obsidian-Publisher überträgt das komplette Markdown einschließlich dieses
Blocks. Die Metadaten sollten deshalb in der Obsidian-Quelldatei gepflegt
werden. Neue Code-Dateien müssen zusätzlich im Repository angelegt werden;
automatisches Extrahieren von Codeblöcken ist nicht Teil dieser Funktion.
Beim systemd-Beispiel ersetzt ein Snippet-Link den vorher duplizierten Codeblock.
Historische Artikelversionen behalten ihre gespeicherten Inhalte.
