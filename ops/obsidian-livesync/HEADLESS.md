# Headless LiveSync fuer Blog-Posts

Der optionale `livesync-cli`-Service spiegelt den Obsidian-LiveSync-Vault auf das lokale `posts/`-Verzeichnis. Der zusaetzliche `publisher`-Service uebernimmt Artikel anhand ihres Frontmatter-Status und haelt GitHub als Publishing-Grenze bei.

```text
Obsidian
  -> CouchDB
  -> livesync-cli
  -> posts/*.md
  -> publisher
  -> Artikel-Branch + PR
  -> CI
  -> Merge
  -> Deployment
```

Ein normaler Save in Obsidian veroeffentlicht nichts. `status: publish` und `status: draft` beschreiben den gewuenschten Veroeffentlichungszustand; live aendert sich dieser erst nach Merge des entsprechenden PR.

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

## Artikel schreiben und publizieren

Neue Obsidian-Artikel starten mit:

```yaml
status: draft
```

Solange der Artikel noch nie veroeffentlicht wurde, bleibt er damit nur in Obsidian/LiveSync und erzeugt keinen Unpublish-PR.

Wenn der Artikel bereit fuer die Freigabe ist:

```yaml
status: publish
```

Danach wartet der Publisher standardmaessig 5 Minuten, in denen der Dateiinhalt unveraendert bleiben muss. Erst dann passiert:

```text
status: publish
  -> obsidian/<artikel-slug>
  -> Commit des Artikels
  -> Pull Request gegen main
```

Weitere Aenderungen am gleichen Artikel erzeugen keinen zweiten PR. Nach erneut 5 Minuten Ruhe wird derselbe Artikel-Branch aktualisiert und damit derselbe offene PR erweitert.

Nach dem Merge bleibt `status: publish` im Artikel stehen. Solange der lokale Inhalt mit `main` identisch ist, tut der Publisher nichts.

## Einen veroeffentlichten Artikel offline nehmen

Bei einem bereits veroeffentlichten Artikel wird:

```yaml
status: draft
```

als bewusster Unpublish-Wunsch behandelt. Nach dem Debounce-Fenster erzeugt der Publisher einen deterministischen PR:

```text
status: draft
  -> obsidian/<artikel-slug>
  -> posts/<artikel>.md wird im Branch geloescht
  -> PR "Unpublish: <Titel>"
  -> Merge
  -> Content-Deploy
  -> Artikel offline
```

Die Markdown-Datei bleibt im Obsidian-Vault erhalten. Git verliert den Inhalt ebenfalls nicht, weil die bisherige Version weiter in der Git-Historie liegt.

Wird der Artikel spaeter wieder auf:

```yaml
status: publish
```

gesetzt, erstellt der Publisher wieder einen Publish-PR und legt den aktuellen Obsidian-Stand erneut unter `posts/` an.

Wenn ein Publish-PR noch offen ist und der Artikel vor dem Merge wieder auf `draft` gesetzt wird, schliesst bzw. wandelt der Publisher den offenen Vorgang so um, dass der Artikel nicht versehentlich spaeter veroeffentlicht wird.

Wichtig: `draft` nimmt einen bereits veroeffentlichten Artikel nicht sofort ohne GitHub-Grenze live vom Netz. Offline wird er nach Merge des Unpublish-PR. Dadurch bleiben CI, Review und Deployment nachvollziehbar.

Soll ein bereits veroeffentlichter Artikel nur ueberarbeitet werden, waehrend die aktuelle Live-Version online bleiben soll, bleibt `status: publish` gesetzt. Die Aenderungen landen dann in einem normalen Update-PR; bis zu dessen Merge bleibt die bisherige Version live.

## Publisher auf Hetzner deployen

Der Publisher verwendet die GitHub API und veraendert den Git-Checkout auf Hetzner nicht per `git switch`.

Im GitHub Environment `production` wird dafuer einmalig folgendes Secret benoetigt:

```text
OBSIDIAN_PUBLISHER_GITHUB_TOKEN
```

Empfohlen ist ein Fine-grained Personal Access Token nur fuer `0b-ivan/Blog` mit:

```text
Contents: Read and write
Pull requests: Read and write
```

Der Workflow:

```text
.github/workflows/deploy-obsidian-publisher.yml
```

wird nach relevanten Merges nach `main` automatisch ausgefuehrt und kann auch manuell gestartet werden.

Serverseitige Einstellungen werden nach:

```text
/opt/Blog/ops/obsidian-livesync/.publisher.env
```

geschrieben. Die Datei wird nicht committed.

Publisher pruefen:

```bash
cd /opt/Blog/ops/obsidian-livesync

docker compose \
  --env-file .env \
  --env-file .publisher.env \
  --profile publisher \
  ps publisher

docker compose \
  --env-file .env \
  --env-file .publisher.env \
  --profile publisher \
  logs -f publisher
```

## Stoppen

Nur den Headless-Daemon stoppen:

```bash
docker compose --profile headless stop livesync-cli
```

Nur den Publisher stoppen:

```bash
docker compose --env-file .env --env-file .publisher.env --profile publisher stop publisher
```

CouchDB bleibt dabei aktiv.

## Wichtige Hinweise

- Nicht gleichzeitig einen zweiten Datei-Sync wie iCloud, Dropbox oder Obsidian Sync auf dasselbe Vault-Verzeichnis loslassen.
- Der Publisher arbeitet nur mit Markdown-Dateien direkt unter `posts/`.
- `status: draft` bei einem neuen, nie veroeffentlichten Artikel bleibt lokal/LiveSync-only.
- `status: draft` bei einem bereits veroeffentlichten Artikel erzeugt einen Unpublish-PR.
- `status: publish` ist eine explizite Freigabe fuer GitHub, aber noch keine Live-Veroeffentlichung. Live wird der Artikel erst nach Merge nach `main`.
- Ein erster bidirektionaler Mirror kann Dateien aus CouchDB nach `posts/` importieren. Deshalb den ersten Sync kontrollieren, bevor Artikel auf `status: publish` gesetzt werden.
