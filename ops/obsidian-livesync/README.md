# Obsidian Self-hosted LiveSync

Dieses Verzeichnis stellt den Serverteil fuer Obsidian Self-hosted LiveSync bereit.

Obsidian selbst laeuft weiterhin auf Mac/iPhone/etc. Serverseitig wird nur CouchDB betrieben. Cloudflare ist **optional**: Wenn bereits ein `cloudflared`-Dienst bzw. Tunnel auf dem Server laeuft, muss dieser Stack keinen zweiten Tunnel starten und braucht auch keinen eigenen Cloudflare-Token.

## Architektur

Empfohlener Aufbau bei bereits vorhandenem Cloudflare Tunnel:

```text
Obsidian Mac / iPhone
        |
        | HTTPS
        v
bestehender Cloudflare Tunnel
        |
        v
CouchDB :5984
```

Alternativ kann dieser Stack optional einen eigenen `cloudflared`-Container starten:

```text
Obsidian
   |
   v
Cloudflare Tunnel
   |
   v
cloudflared (optional profile)
   |
   v
CouchDB
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

Mindestens erforderlich:

```text
COUCHDB_USER=obsidian
COUCHDB_PASSWORD=<langes-zufaelliges-passwort>
COUCHDB_DATABASE=kernelnotes
```

Optional:

```text
CF_TUNNEL_TOKEN=
```

Der Token wird nur benoetigt, wenn dieser Compose-Stack selbst `cloudflared` starten soll.

`.env` wird nicht committed.

## 2. Vorhandenen Cloudflare Tunnel verwenden

Das ist der Standardfall, wenn Cloudflare auf dem Server bereits laeuft.

CouchDB und der optionale Cloudflare-Container verwenden das benannte Docker-Netzwerk:

```text
kernel-notes-obsidian-livesync
```

Wenn dein vorhandenes `cloudflared` ebenfalls als Docker-Container laeuft, kannst du ihn an dieses Netzwerk haengen:

```bash
docker network connect kernel-notes-obsidian-livesync <dein-cloudflared-container>
```

Im vorhandenen Tunnel kann der Origin dann auf folgenden Service zeigen:

```text
http://kernel-notes-livesync-couchdb:5984
```

Empfohlener Public Hostname:

```text
obsidian-sync.obivan.org
```

Port `5984` muss dafuer nicht oeffentlich freigegeben werden.

Wenn `cloudflared` direkt auf dem Hetzner-Host als systemd-Service laeuft, wird CouchDB vom Compose-Stack nur auf dem Host-Loopback veroeffentlicht:

```text
127.0.0.1:5984 -> CouchDB:5984
```

Der Tunnel-Origin muss in diesem Fall auf folgenden lokalen Endpunkt zeigen:

```text
http://127.0.0.1:5984
```

Damit kann der Host-Dienst CouchDB erreichen, ohne Port `5984` auf einer externen Netzwerkschnittstelle zu oeffnen.

Test direkt auf dem Host:

```bash
curl -i http://127.0.0.1:5984/_up
```

### Cloudflare Access

Ein interaktiver Cloudflare-Access-Login vor dem LiveSync-Hostname kann die Replikation blockieren. Fuer einen stabilen Betrieb daher zunaechst CouchDB-Authentifizierung + HTTPS verwenden. Fuer Cloudflare Access sind Service Tokens/custom headers sinnvoll; CORS/OPTIONS darf dabei nicht blockiert werden.

## 3. Optional: eigenen cloudflared-Container starten

Nur wenn dieser Stack den Tunnel selbst betreiben soll:

```text
CF_TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

Dann mit Profil starten:

```bash
docker compose --profile cloudflare up -d
```

Ohne das Profil startet nur CouchDB + Initialisierung:

```bash
docker compose up -d
```

## 4. Deployment ueber GitHub Actions

Das Repository enthaelt den Workflow:

```text
.github/workflows/deploy-obsidian-livesync.yml
```

Aenderungen unter `ops/obsidian-livesync/**` werden nach einem Merge nach `main` automatisch deployed. Auch Aenderungen am Deployment-Workflow selbst loesen den LiveSync-Deploy aus.

Der Workflow kann weiterhin manuell gestartet werden:

```text
Actions -> Deploy Obsidian LiveSync -> Run workflow
```

Er verwendet dasselbe GitHub Environment `production` und dieselben Hetzner-SSH-Secrets wie das Blog-Deployment.

Zwingend erforderlich sind nur:

```text
OBSIDIAN_COUCHDB_USER
OBSIDIAN_COUCHDB_PASSWORD
```

Optional:

```text
OBSIDIAN_CF_TUNNEL_TOKEN
```

Der Cloudflare-Token wird nur ausgewertet, wenn beim manuellen Workflow die Option

```text
deploy_cloudflared = true
```

aktiviert wird. Automatische Deployments nach `main` verwenden standardmaessig den bereits auf dem Host laufenden `cloudflared`-Dienst.

Der Workflow kopiert das Stack-Setup nach:

```text
/opt/Blog/ops/obsidian-livesync
```

Beim Deployment wird CouchDB neu erstellt, auf Health geprueft und zusaetzlich kontrolliert, dass Port `5984` wirklich nur auf

```text
127.0.0.1:5984
```

veroeffentlicht ist. Danach prueft der Workflow den oeffentlichen Endpunkt

```text
https://obsidian-sync.obivan.org/_up
```

Ein `502` laesst das Deployment fehlschlagen. `200` oder `401` gelten als erreichbarer CouchDB-Origin.

## 5. Status pruefen

Ohne eingebauten Cloudflare-Dienst:

```bash
docker compose ps
docker compose logs couchdb-init
docker compose logs -f couchdb
```

Mit optionalem Cloudflare-Profil:

```bash
docker compose --profile cloudflare ps
docker compose logs -f cloudflared
```

Der Init-Container richtet Single-Node-CouchDB, Authentifizierung, CORS, Request-/Dokumentgroessen und die Datenbank ein.

Ein erneuter Lauf ist moeglich mit:

```bash
docker compose restart couchdb-init
```

## 6. Obsidian konfigurieren

Auf dem ersten Geraet das Community Plugin `Self-hosted LiveSync` installieren.

CouchDB-Verbindung:

```text
URI:      https://obsidian-sync.obivan.org
Username: Wert aus COUCHDB_USER
Password: Wert aus COUCHDB_PASSWORD
Database: Wert aus COUCHDB_DATABASE (Standard: kernelnotes)
```

Bei Cloudflare sollte im Plugin `Use Request API` / `Use Internal API` aktiviert werden, falls Long-Polling zu 524-Timeouts fuehrt.

Danach zuerst die Datenbankverbindung testen und erst dann die Synchronisation aktivieren.

## 7. Zweites Geraet hinzufuegen

Auf dem ersten Geraet einen Self-hosted-LiveSync Setup URI erzeugen und auf dem zweiten Geraet importieren.

Der Setup URI enthaelt verschluesselte Verbindungsdaten und ist wie ein Secret zu behandeln. Nicht in Git, Tickets, Screenshots oder den Vault schreiben. Die Passphrase fuer den Setup URI getrennt uebertragen.

## 8. Nicht parallel mit anderen Vault-Syncs betreiben

Fuer denselben Vault nicht gleichzeitig verwenden:

- Obsidian Sync
- iCloud Drive Sync
- Dropbox/OneDrive-Dateisynchronisation
- andere Tools, die denselben Vault auf Dateiebene replizieren

LiveSync und Git koennen gemeinsam verwendet werden, weil Git Versionierung/Publishing uebernimmt. Vor Git-Arbeit sollte die LiveSync-Synchronisation abgeschlossen sein.

## Betrieb

Update ohne eigenen Cloudflare-Dienst:

```bash
docker compose pull
docker compose up -d
```

Mit optionalem Cloudflare-Profil:

```bash
docker compose --profile cloudflare pull
docker compose --profile cloudflare up -d
```

Stoppen ohne Datenverlust:

```bash
docker compose down
```

Die CouchDB-Daten liegen im benannten Docker-Volume:

```text
kernel-notes-obsidian-couchdb-data
```

`docker compose down -v` loescht das Volume und darf im normalen Betrieb nicht verwendet werden.

## Backup-Hinweis

LiveSync ersetzt kein Backup. Vor groesseren Updates sollte das CouchDB-Volume bzw. die CouchDB-Daten separat gesichert werden. Der Git-Verlauf deckt nur bereits commitete Blog-Inhalte ab, nicht automatisch jeden noch unveroeffentlichten Stand im Vault.
