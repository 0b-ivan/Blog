# Kernel Notes mit Obsidian verwalten

Das komplette Repository kann als Obsidian-Vault geoeffnet werden. Die eigentlichen Blogartikel bleiben normale Markdown-Dateien unter `posts/`; GitHub, CI und Deployment funktionieren dadurch unveraendert weiter.

## Einmaliges Setup

1. Repository lokal klonen.
2. In Obsidian `Open folder as vault` waehlen und den Repository-Ordner `Blog` oeffnen.
3. Den Obsidian-Core-Plugin `Templates` aktivieren.
4. Als Template-Ordner `templates` konfigurieren.
5. Unter `Files & Links` den Attachment-Ordner fuer Artikelbilder auf `assets/posts` setzen, wenn Bilder direkt aus Obsidian eingefuegt werden sollen.

Lokale Workspace-Zustaende von Obsidian werden nicht committed. Die eigentlichen Inhalte und Templates bleiben dagegen Teil des Repositories.

## Neuer Artikel per Obsidian

Der sichere Weg ist zuerst einen Feature-Branch von `staging` anzulegen:

```bash
git switch staging
git pull
git switch -c post/mein-artikel
```

Danach in Obsidian eine neue Datei unter `posts/` mit einem Namen nach diesem Muster erstellen:

```text
2026-08-20-mein-artikel.md
```

Anschliessend das Template `templates/blog-post.md` einfuegen. Weil `{{title}}` in Obsidian dem Dateinamen entspricht, wird die `id` dabei automatisch aus dem Dateinamen uebernommen. Den sichtbaren `title`, `category`, `excerpt` und die `tags` danach ausfuellen.

## Neuer Artikel per CLI

Alternativ erzeugt der Generator eine fertige Datei mit Slug und dem von der CI erwarteten Frontmatter:

```bash
npm run post:new -- "SQLite - oefter benutzt als gedacht"
```

Optionale Metadaten koennen direkt mitgegeben werden:

```bash
npm run post:new -- \
  "SQLite - oefter benutzt als gedacht" \
  --category Datenbanken \
  --tags "SQLite,Linux,Self-Hosting" \
  --excerpt "SQLite begegnet mir im Self-Hosting haeufiger als gedacht."
```

Das erzeugt beispielsweise:

```text
posts/2026-08-20-sqlite-oefter-benutzt-als-gedacht.md
```

## Artikel archivieren

Ein archivierter Artikel wird nicht geloescht. Seine Markdown-Datei wird aus `posts/` nach `archive/` verschoben und bleibt damit weiterhin im Repository und im Obsidian-Vault erhalten.

Weil der Blog nur Markdown-Dateien direkt aus `posts/` als Artikel einliest, verschwindet ein archivierter Beitrag nach dem normalen PR/Merge/Deployment automatisch von der Website, aus der Artikel-API, dem RSS-Feed und den verwandten Beitraegen.

Archivieren per Slug oder Dateiname:

```bash
npm run post:archive -- 2026-08-19-mein-artikel
```

Auch der kurze Slug funktioniert, sofern er eindeutig ist:

```bash
npm run post:archive -- mein-artikel
```

Danach liegt die Datei beispielsweise hier:

```text
archive/2026-08-19-mein-artikel.md
```

Archivierte Beitraege sind damit nicht mehr unter ihrer normalen `/posts/<slug>`-URL verfuegbar. Sie bleiben jedoch ueber `/archive` und `/archive/<slug>` oeffentlich lesbar und bleiben zusaetzlich in Git und Obsidian erhalten.

## Artikel wiederherstellen

Ein archivierter Beitrag kann jederzeit wieder nach `posts/` verschoben werden:

```bash
npm run post:restore -- mein-artikel
```

Nach PR, Merge und Deployment ist der Beitrag wieder normal im Blog sichtbar. Beim Archivieren und Wiederherstellen werden Inhalt und Frontmatter nicht veraendert.

## Rechtschreibung und Grammatik

Pull Requests mit Aenderungen unter `posts/` starten zusaetzlich den Workflow `Proofread Blog Posts`. Die Pruefung besteht aus zwei Teilen:

- CSpell mit deutschem Woerterbuch fuer klassische Tippfehler
- LanguageTool fuer Rechtschreibung, Grammatik und Stil

Frontmatter, Codebloecke, Inline-Code und URLs werden soweit moeglich von den Sprachpruefungen ausgeblendet. Technische Begriffe und bewusst verwendete Schreibweisen koennen zentral gepflegt werden:

```text
config/proofread-words.txt
```

Die Hinweise sind bewusst nicht blockierend. Ein technischer Fix oder eine absichtlich gewaehlte Formulierung soll nicht allein wegen eines Sprachhinweises am Merge gehindert werden.

### CSpell lokal

Alle aktiven Beitraege pruefen:

```bash
npm run posts:spellcheck
```

Einen einzelnen Beitrag pruefen:

```bash
npm run posts:spellcheck -- posts/2026-08-20-mein-artikel.md
```

CSpell und das deutsche Woerterbuch werden in festen Versionen ueber `npm exec` geladen; dadurch muss kein zusaetzliches Paket dauerhaft in `package.json` oder `package-lock.json` aufgenommen werden.

### LanguageTool lokal

Wenn ein LanguageTool HTTP Server unter `http://127.0.0.1:8010/v2/check` laeuft:

```bash
npm run posts:proofread
```

Ein einzelner Beitrag kann gezielt geprueft werden:

```bash
npm run posts:proofread -- posts/2026-08-20-mein-artikel.md
```

Eine andere LanguageTool-Instanz kann ueber `LANGUAGETOOL_URL` gesetzt werden.

### Autocorrect als Pull Request

Der manuelle GitHub-Workflow `Autocorrect Blog Posts` prueft `main`, wendet nur sichere automatische Korrekturen an und erzeugt bei Aenderungen einen neuen Branch und Pull Request.

CSpell korrigiert dabei nur Treffer mit genau einem eindeutigen Ersatz. Mehrdeutige CSpell-Vorschlaege bleiben unveraendert. LanguageTool korrigiert ebenfalls nur eindeutige Rechtschreibtreffer; Typografie-, Grammatik- und Stilvorschlaege werden nicht automatisch umgeschrieben.

Damit bleibt der erzeugte PR die Sicherheitsgrenze: Vor dem Merge kann der komplette Diff geprueft werden.

Der Workflow kann unter GitHub Actions gestartet werden. Das optionale Feld `target` kann auf einen einzelnen Beitrag gesetzt werden; leer bedeutet alle aktiven Beitraege unter `posts/`.

Fuer die automatische PR-Erstellung muss das Repository GitHub Actions erlauben, Pull Requests mit dem `GITHUB_TOKEN` zu erstellen (`Settings -> Actions -> General -> Workflow permissions -> Allow GitHub Actions to create and approve pull requests`).

## Vor dem Push pruefen

```bash
npm run posts:validate-meta
npm run posts:spellcheck
npm run lint
npm run test:coverage
```

Danach normal committen und pushen:

```bash
git add posts/ archive/ assets/posts/
git commit -m "Update blog posts"
git push -u origin HEAD
```

Anschliessend einen Pull Request gegen `staging` erstellen. Nach erfolgreicher CI und Merge wird der Stand automatisch auf `staging-blog.obivan.org` deployed. Sobald der neue Build dort gesund und als Staging-Build verifiziert ist, erzeugt GitHub Actions automatisch einen Promotion-PR von `staging` nach `main`. Erst dessen manueller Merge veroeffentlicht einen **neuen oder wieder veröffentlichten** Artikel in Production.

### Publish und Unpublish sind bewusst asymmetrisch

Für neue Inhalte gilt weiterhin:

```text
publish
  -> PR nach staging
  -> Staging deployen + verifizieren
  -> Promotion-PR
  -> manueller Merge nach main
  -> Production
```

Für `status: draft` eines bereits veröffentlichten Artikels gilt dagegen der Fast-Track:

```text
unpublish
  ├─ deletion-only PR -> staging
  └─ deletion-only PR -> main
       -> Required Checks
       -> automatischer Merge
```

Damit kann ein Takedown nicht durch den normalen Release-Zyklus verzögert werden. Der Fast-Track akzeptiert ausschließlich Löschungen von Artikeldateien; er kann deshalb nicht dazu benutzt werden, neue Inhalte oder sonstige Änderungen an der manuellen Production-Freigabe vorbeizuschleusen. Ein späteres `status: publish` folgt wieder vollständig dem normalen Staging- und Promotion-Pfad.

## Bilder

Für Artikelbilder gilt die verbindliche Policy in [`docs/article-images.md`](article-images.md).

Kurzfassung:

- Cover kommen über die bestehende Pixabay-Pipeline und liegen unter `assets/covers/`.
- Inline-Bilder liegen lokal unter `assets/posts/<asset-scope>/`.
- Bevorzugt werden echte Fotos/Screenshots, wenn sie inhaltlich stärker sind und die Nutzung geklärt ist; Diagramme ergänzen dort, wo sie etwas erklären.
- Kein Hotlinking externer Bilder.
- Jedes Inline-Bild braucht einen aussagekräftigen Alt-Text.
- Fremde Bilder bekommen Quellen-/Lizenznachweis in `posts/_sources.json`.

Beispiel:

```md
![Puck-Man-Arcade-Automat](/assets/posts/pac-man-puck-man/01-puck-man-cabinet.jpg)

*Abb. 1: Früher Puck-Man-Automat. Quelle: [Wikimedia Commons](/sources.html#pacman-puckman-cabinet).*
```

Root-relative Pfade funktionieren auf Website, RSS, EPUB/PDF und in der Artikelhistorie reproduzierbar.

Für fremde, rechteklar wiederverwendbare Fotos gibt es zusätzlich die [Photo Connection](photo-connection.md). Bei Wikimedia Commons kann in Obsidian zunächst einfach die externe Bild-URL als normales Markdown-Bild eingefügt werden:

```md
![Aussagekräftiger Alt-Text](https://upload.wikimedia.org/wikipedia/commons/.../bild.jpg)
```

Nach dem Push auf einen `obsidian/**`-, `post/**`-, `feat/**`- oder `fix/**`-Branch erzeugt die Pipeline automatisch das Manifest, lädt und validiert das Bild, ergänzt den Quellenverweis und ersetzt den Hotlink im Artikel durch einen Root-relativen Pfad unter `/assets/posts/`. Andere externe Provider bleiben blockiert, solange kein lizenzbewusster Adapter dafür existiert.

## Was nicht ins Repository gehoert

Obsidian erzeugt lokale UI- und Workspace-Dateien. Diese sind benutzerspezifisch und werden ueber `.gitignore` ausgeschlossen. Community-Plugins sollten ebenfalls nicht ungeprueft als Teil des Blog-Repositories committed werden.
