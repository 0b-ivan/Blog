# Obsidian Self-hosted LiveSync

Dieses Verzeichnis stellt den Serverteil fuer Obsidian Self-hosted LiveSync bereit.

Wichtig: Obsidian selbst laeuft weiterhin auf Mac/iPhone/etc. Serverseitig wird CouchDB betrieben. `cloudflared` stellt CouchDB ueber einen ausgehenden Cloudflare Tunnel per HTTPS bereit. Auf dem Host wird bewusst kein CouchDB-Port veroeffentlicht.

## Architektur

```text
Obsidian Mac / iPhone
        |
        | HTTPS
        v
Cloudflare Tunnel
        |
        v
cloudflared container
        |
        v
CouchDB :5984 (nur Docker-Netz)
```

Git und LiveSync haben unterschiedliche Aufgaben:

- LiveSync synchronisiert den Obsidian-Vault zwischen Geraeten.
- Git bleibt die Quelle fuer Versionierung, Branches, Pull Requests und Blog-Deployment.
- `main` wird weiterhin nur ueber PR + CI + Merge aktualisiert.

## 1. Server vorbereiten

Fuer einen manuellen Start:

```bash
cd ops/obsidian-livesync
cp .env.example .env
chmod 600 .env
```

In `.env` mindestens setzen:

```text
COUCHDB_USER=obsidian
COUCHDB_PASSWORD=<langes-zufaelliges-passwort>
COUCHDB_DATABASE=kernelnotes
CF_TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

`.env` wird nicht committed.

## 2. Cloudflare Tunnel anlegen

In Cloudflare Zero Trust:

1. `Networks -> Tunnels -> Create tunnel`
2. einen Cloudflared-Tunnel anlegen
3. den Connector-Token speichern
4. einen Public Hostname anlegen, empfohlen:

```text
obsidian-sync.obivan.org
```

Als Origin Service eintragen:

```text
http://couchdb:5984
```

Das funktioniert, weil `cloudflared` und CouchDB im selben Docker-Netzwerk laufen.

Keinen Port `5984` in der Firewall oder im Compose nach aussen freigeben.

### Cloudflare Access

Ein interaktiver Cloudflare-Access-Login vor diesem Hostnamen kann die Obsidian-Replikation blockieren. Fuer den ersten stabilen Betrieb daher CouchDB-Authentifizierung + HTTPS verwenden. Wer spaeter Cloudflare Access davor setzen will, sollte mit Service Tokens/custom headers arbeiten und CORS/OPTIONS nicht blockieren.

## 3. Deployment ueber GitHub Actions

Das Repository enthaelt den manuellen Workflow:

```text
.github/workflows/deploy-obsidian-livesync.yml
```

Er verwendet dasselbe GitHub Environment `production` und dieselben Hetzner-SSH-Secrets wie das Blog-Deployment. Zusaetzlich muessen dort angelegt werden:

```text
OBSIDIAN_COUCHDB_USER
OBSIDIAN_COUCHDB_PASSWORD
OBSIDIAN_CF_TUNNEL_TOKEN
```

Der Workflow kopiert das Stack-Setup nach:

```text
/opt/Blog/ops/obsidian-livesync
```

und startet dort:

```bash
docker compose --env-file .env --profile cloudflare up -d
```

Anschliessend prueft der Workflow, ob CouchDB healthy ist und `cloudflared` laeuft.

Start in GitHub:

```text
Actions -> Deploy Obsidian LiveSync -> Run workflow
```

Der Workflow ist bewusst `workflow_dispatch` und wird nicht bei jedem Blog-Deployment gestartet.

## 4. Manueller Stack-Start

Alternativ direkt auf einem Server:

```bash
docker compose --profile cloudflare up -d
```

Status pruefen:

```bash
docker compose --profile cloudflare ps
docker compose logs couchdb-init
docker compose logs cloudflared
```

Der Init-Container richtet Single-Node-CouchDB, Authentifizierung, CORS, Request-/Dokumentgroessen und die Datenbank ein.

Ein erneuter Lauf ist moeglich mit:

```bash
docker compose restart couchdb-init
```

## 5. Obsidian konfigurieren

Auf dem ersten Geraet das Community Plugin `Self-hosted LiveSync` installieren.

CouchDB-Verbindung:

```text
URI:      https://obsidian-sync.obivan.org
Username: Wert aus COUCHDB_USER
Password: Wert aus COUCHDB_PASSWORD
Database: Wert aus COUCHDB_DATABASE (Standard: kernelnotes)
```

Bei Cloudflare sollte im Plugin `Use Request API` / `Use Internal API` aktiviert werden, falls Long-Polling zu 524-Timeouts fuehrt. Das ist ein bekannter Sonderfall bei Cloudflare-Tunneln.

Danach zuerst die Datenbankverbindung testen und erst dann die Synchronisation aktivieren.

## 6. Zweites Geraet hinzufuegen

Auf dem ersten Geraet einen Self-hosted-LiveSync Setup URI erzeugen und auf dem zweiten Geraet importieren.

Der Setup URI enthaelt verschluesselte Verbindungsdaten und ist wie ein Secret zu behandeln. Nicht in Git, Tickets, Screenshots oder den Vault schreiben. Die Passphrase fuer den Setup URI getrennt uebertragen.

## 7. Nicht parallel mit anderen Vault-Syncs betreiben

Fuer denselben Vault nicht gleichzeitig verwenden:

- Obsidian Sync
- iCloud Drive Sync
- Dropbox/OneDrive-Dateisynchronisation
- andere Tools, die denselben Vault auf Dateiebene replizieren

LiveSync und Git koennen gemeinsam verwendet werden, weil Git Versionierung/Publishing uebernimmt. Trotzdem vor Git-Arbeit immer erst die LiveSync-Synchronisation fertig laufen lassen und anschliessend den aktuellen Git-Branch pruefen.

## Betrieb

Logs:

```bash
docker compose logs -f couchdb
docker compose logs -f cloudflared
```

Update:

```bash
docker compose --profile cloudflare pull
docker compose --profile cloudflare up -d
```

Stoppen ohne Datenverlust:

```bash
docker compose --profile cloudflare down
```

Die CouchDB-Daten liegen im benannten Docker-Volume:

```text
kernel-notes-obsidian-couchdb-data
```

`docker compose down -v` loescht das Volume und darf im normalen Betrieb nicht verwendet werden.

## Backup-Hinweis

LiveSync ersetzt kein Backup. Vor groesseren Updates sollte das CouchDB-Volume bzw. die CouchDB-Daten separat gesichert werden. Der Git-Verlauf deckt nur bereits commitete Blog-Inhalte ab, nicht automatisch jeden noch unveroeffentlichten Stand im Vault.
