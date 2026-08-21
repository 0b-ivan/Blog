---
id: 2026-08-21-docker-vs-docker-compose
version: 1
title: "Docker vs. Docker Compose: Was ist der Unterschied?"
date: 2026-08-21
created_at: 2026-08-21
updated_at: 2026-08-21
author: obivan
reviewed_by: pending
category: DevOps
excerpt: Docker startet Container direkt. Docker Compose beschreibt einen ganzen Stack deklarativ in einer YAML-Datei. Ein praktischer Vergleich mit Befehlen, compose.yaml und Screenshots.
tags: Docker, DevOps, Operations, Architecture
---

Docker und Docker Compose werden oft in einen Topf geworfen. Dabei lösen beide unterschiedliche Aufgaben.

Die kurze Version:

- **Docker** baut, startet und verwaltet Container.
- **Docker Compose** beschreibt mehrere zusammengehörige Container als Anwendung und steuert sie gemeinsam.

Compose ersetzt Docker also nicht. Compose benutzt Docker im Hintergrund und nimmt dir vor allem die wiederholbare Konfiguration eines Stacks ab.

## Ein Container direkt mit Docker

Für einen einzelnen Container reicht meistens ein normaler Docker-Befehl:

```bash
docker run \
  --name web \
  -p 8080:80 \
  -d \
  nginx:alpine
```

Danach kann ich mit `docker ps` prüfen, ob der Container läuft:

```bash
docker ps
```

![Terminal mit docker run und docker ps](/assets/posts/docker-vs-compose/01-docker-run.svg)

*Ein einzelner Container wird direkt über die Docker CLI gestartet.*

Der Befehl enthält bereits einen Teil der Infrastruktur-Konfiguration:

- Containername: `web`
- Port-Mapping: `8080:80`
- Hintergrundbetrieb: `-d`
- Image: `nginx:alpine`

Für einen einzelnen Testcontainer ist das völlig in Ordnung.

## Wo es mit mehreren Containern unübersichtlich wird

Sobald mehrere Container zusammengehören, werden die einzelnen Befehle länger.

Angenommen, ich möchte einen Webserver und zusätzlich Redis starten. Ohne Compose könnte das beispielsweise so aussehen:

```bash
docker network create demo

docker run \
  --name redis \
  --network demo \
  -d \
  redis:7-alpine

docker run \
  --name web \
  --network demo \
  -p 8080:80 \
  -d \
  nginx:alpine
```

Das funktioniert. Ich muss mir aber selbst merken:

- welches Netzwerk verwendet wird
- welche Ports veröffentlicht werden
- welche Images dazugehören
- welche Volumes gebraucht werden
- welche Umgebungsvariablen gesetzt werden
- wie die Container gemeinsam gestartet und gestoppt werden

Je größer der Stack wird, desto eher wird aus einem einfachen `docker run` eine kleine Sammlung von Shell-Befehlen.

## Dasselbe mit Docker Compose

Mit Compose wandert diese Konfiguration in eine Datei, normalerweise `compose.yaml`:

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

![compose.yaml mit Web- und Redis-Service](/assets/posts/docker-vs-compose/02-compose-yaml.svg)

*Die komplette Stack-Konfiguration liegt deklarativ in einer Datei.*

Der Stack startet dann mit:

```bash
docker compose up -d
```

Status prüfen:

```bash
docker compose ps
```

Logs verfolgen:

```bash
docker compose logs -f
```

Und alles gemeinsam stoppen:

```bash
docker compose down
```

![Terminal mit docker compose up und docker compose ps](/assets/posts/docker-vs-compose/03-compose-up.svg)

*Compose behandelt die Services als zusammengehörigen Stack.*

## Der eigentliche Unterschied

| Thema | Docker CLI | Docker Compose |
| --- | --- | --- |
| Konfiguration | Optionen im Befehl | `compose.yaml` |
| Einzelner Container | sehr direkt | möglich, aber oft unnötig |
| Mehrere Container | mehrere Befehle nötig | ein gemeinsamer Stack |
| Netzwerk | manuell anlegen/zuweisen | wird für den Stack automatisch angelegt |
| Volumes | per CLI-Option | zentral in YAML beschrieben |
| Umgebungsvariablen | `-e` / `--env-file` | unter `environment` oder `env_file` |
| Start | `docker run ...` | `docker compose up -d` |
| Stoppen | Container einzeln behandeln | `docker compose down` |
| Versionierbarkeit | Befehl muss dokumentiert werden | YAML kann direkt mit Git versioniert werden |

Der für mich wichtigste Unterschied ist deshalb nicht nur die Anzahl der Container, sondern **wie reproduzierbar die Konfiguration ist**.

Ein langer `docker run`-Befehl kann funktionieren. Eine `compose.yaml` zeigt aber sofort, welche Services, Ports, Volumes und Abhängigkeiten zu einer Anwendung gehören.

## Docker Compose ist kein Kubernetes

Compose ist bewusst kleiner gedacht.

Es eignet sich sehr gut für:

- lokale Entwicklungsumgebungen
- Homelab-Services
- kleine bis mittlere Server-Stacks
- Anwendungen auf einem einzelnen Docker-Host
- reproduzierbare Testumgebungen

Compose ist dagegen kein Cluster-Orchestrator. Wenn Container über mehrere Hosts verteilt, automatisch skaliert oder mit komplexem Scheduling betrieben werden sollen, kommen andere Werkzeuge ins Spiel.

Für viele Self-Hosting- und kleinere Produktions-Setups ist Compose aber gerade deshalb angenehm: Es löst das Problem, ohne direkt eine größere Orchestrierungsplattform einzuführen.

## Dockerfile und Docker Compose sind ebenfalls nicht dasselbe

Eine zweite Verwechslung ist `Dockerfile` vs. `compose.yaml`.

Ein **Dockerfile beschreibt, wie ein Image gebaut wird**:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
```

Eine **Compose-Datei beschreibt, wie ein oder mehrere Container ausgeführt werden**:

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
```

Das lässt sich gut als Kette lesen:

```text
Dockerfile
   ↓
Docker Image
   ↓
Docker Container
   ↓
Docker Compose gruppiert und konfiguriert mehrere Container
```

Ein Projekt kann also gleichzeitig ein `Dockerfile` und eine `compose.yaml` haben. Das ist sogar sehr üblich.

## Wann nehme ich was?

Für einen schnellen Test:

```bash
docker run --rm alpine:latest echo "Hallo Container"
```

Dafür brauche ich kein Compose.

Für eine Anwendung aus Webserver, Datenbank und Cache würde ich dagegen eher eine Compose-Datei verwenden:

```text
compose.yaml
├── web
├── database
└── cache
```

Dann reicht für den ganzen Stack:

```bash
docker compose up -d
```

## Fazit

Docker und Docker Compose sind keine Konkurrenzprodukte.

**Docker ist die Basis. Compose ist die deklarative Schicht darüber.**

Für einen einzelnen kurzlebigen Container ist `docker run` oft der schnellste Weg. Sobald eine Anwendung aus mehreren Services besteht oder die Konfiguration reproduzierbar in Git liegen soll, wird Docker Compose deutlich angenehmer.

Die praktische Faustregel:

```text
Ein schneller Container?        → docker run
Ein reproduzierbarer Stack?     → docker compose
Ein eigenes Image bauen?        → Dockerfile
```

Damit ist auch die Rollenverteilung klar: Docker führt Container aus, Dockerfile baut Images und Docker Compose beschreibt, wie die Container einer Anwendung zusammen betrieben werden.
