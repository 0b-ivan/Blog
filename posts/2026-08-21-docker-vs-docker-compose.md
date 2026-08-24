---
id: 2026-08-21-docker-vs-docker-compose
version: 2
title: "Docker vs. Docker Compose: Was ist der Unterschied?"
date: 2026-08-21
published_at: 2026-08-21T07:12:56+02:00
created_at: 2026-08-21
updated_at: 2026-08-24
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

[Ein Container direkt mit Docker](/snippets/2026-08-21-docker-vs-docker-compose/01-ein-container-direkt-mit-docker.sh "snippet:bash")

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

[Wo es mit mehreren Containern unübersichtlich wird](/snippets/2026-08-21-docker-vs-docker-compose/02-wo-es-mit-mehreren-containern-unuebersichtlich-wird.sh "snippet:bash")

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

[Dasselbe mit Docker Compose](/snippets/2026-08-21-docker-vs-docker-compose/03-dasselbe-mit-docker-compose.yml "snippet:yaml")

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

[Dockerfile und Docker Compose sind ebenfalls nicht dasselbe](/snippets/2026-08-21-docker-vs-docker-compose/04-dockerfile-und-docker-compose-sind-ebenfalls-nicht-dasselbe.Dockerfile "snippet:dockerfile")

Eine **Compose-Datei beschreibt, wie ein oder mehrere Container ausgeführt werden**:

[Dockerfile und Docker Compose sind ebenfalls nicht dasselbe](/snippets/2026-08-21-docker-vs-docker-compose/05-dockerfile-und-docker-compose-sind-ebenfalls-nicht-dasselbe.yml "snippet:yaml")

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

## Querverweise

- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]
- [[wie-dieser-blog-gebaut-ist|Wie dieser Blog gebaut ist]]

## Quellen

- [docker container run](/sources.html#docker-run)
- [Docker Compose Referenz](/sources.html#docker-compose)
- [Dockerfile Referenz](/sources.html#dockerfile)
