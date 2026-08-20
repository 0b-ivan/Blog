# Headless LiveSync fuer Blog-Posts

Der optionale `livesync-cli`-Service spiegelt den Obsidian-LiveSync-Vault auf das lokale `posts/`-Verzeichnis des Git-Checkouts. Dadurch bleibt Git weiterhin die Publishing-Grenze:

```text
Obsidian
  -> CouchDB
  -> livesync-cli
  -> posts/*.md
  -> Git Branch / Commit / PR
  -> CI
  -> Merge
  -> Deployment
```

Der Headless-Service ist im Compose-Profil `headless` und startet deshalb nicht beim normalen `docker compose up -d`.

## Voraussetzungen

- CouchDB + Self-hosted LiveSync funktionieren bereits auf mindestens einem Obsidian-Geraet.
- Der Repository-Checkout liegt so, dass `ops/obsidian-livesync/../../posts` auf das gewuenschte `posts/`-Verzeichnis zeigt. Alternativ `OBSIDIAN_VAULT_PATH` in `.env` setzen.
- Vor dem ersten Mirror muss `posts/` einen sauberen Git-Status haben.
- Testdateien wie `test.md` sollten vor dem Bootstrap in Obsidian geloescht werden, wenn sie nicht in das Repository uebernommen werden sollen.

## Setup URI erzeugen

Auf dem bereits funktionierenden Obsidian-Geraet ueber die Command Palette eine neue Self-hosted-LiveSync Setup URI erzeugen. Die Setup URI und ihre Passphrase sind Secrets und duerfen nicht committed werden.

## Einmaliger Bootstrap

Vom Stack-Verzeichnis aus:

```bash
cd /opt/Blog/ops/obsidian-livesync
sh scripts/livesync-bootstrap.sh
```

Das Script fragt interaktiv nach:

```text
Setup URI
Setup URI passphrase
```

Danach fuehrt es in dieser Reihenfolge aus:

1. Setup URI in das persistente CLI-Datenvolume importieren.
2. Einen Remote-Sync mit CouchDB ausfuehren.
3. Remote-Vault und lokales `posts/` bidirektional spiegeln.
4. Den dauerhaften `livesync-cli`-Daemon starten.
5. Den Git-Status von `posts/` anzeigen.

Die CLI-Daten und Einstellungen liegen im Docker-Volume:

```text
kernel-notes-obsidian-livesync-cli-data
```

Die Setup URI selbst wird nicht im Repository gespeichert.

## Status pruefen

```bash
docker compose --profile headless ps
docker compose --profile headless logs -f livesync-cli
```

Dateien im lokalen LiveSync-Datenbestand auflisten:

```bash
docker compose --profile headless run --rm livesync-cli ls
```

Git-Aenderungen aus Obsidian anzeigen:

```bash
cd /opt/Blog
git status --short -- posts
git diff -- posts
```

## Aenderungen veroeffentlichen

LiveSync schreibt nur in den Checkout. Es merged oder deployed nichts automatisch.

Nach der Bearbeitung in Obsidian:

```bash
cd /opt/Blog
git switch -c obsidian/meine-aenderung
git add posts/
git commit -m "Update blog posts from Obsidian"
git push -u origin HEAD
```

Danach wie gewohnt einen Pull Request gegen `main` erstellen. CI, Metadatenvalidierung, CSpell und LanguageTool laufen weiterhin im normalen PR-Workflow.

## Stoppen

Nur den Headless-Daemon stoppen:

```bash
docker compose --profile headless stop livesync-cli
```

CouchDB bleibt dabei aktiv.

## Wichtige Hinweise

- Nicht gleichzeitig einen zweiten Datei-Sync wie iCloud, Dropbox oder Obsidian Sync auf dasselbe Vault-Verzeichnis loslassen.
- Vor `git pull`, Rebase oder Branch-Wechsel sollte LiveSync kurz zur Ruhe gekommen sein. Bei groesseren Git-Operationen kann `livesync-cli` voruebergehend gestoppt werden.
- Ein erster bidirektionaler Mirror kann Dateien aus CouchDB nach `posts/` importieren. Deshalb immer den anschliessenden `git status` pruefen, bevor etwas committed wird.
