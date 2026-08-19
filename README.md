# Kernel Notes

Persoenlicher IT-Blog mit Node.js/Express, Markdown-Posts, Docker und GitHub Actions.

Der Blog wird lokal per Docker Compose entwickelt und in Production als fertiges Docker-Image aus GHCR auf einem Hetzner-Host betrieben. Zusaetzlich existiert weiterhin eine OpenFaaS/faasd-Variante.

## Betriebsarten

### Lokal mit Docker Compose

Voraussetzung: Docker Engine + Docker Compose Plugin.

```bash
docker compose up -d --build
```

Der Blog ist danach erreichbar unter:

```text
http://localhost:8080
```

Stoppen:

```bash
docker compose down
```

### Production auf Hetzner

Production baut nicht mehr auf dem Hetzner-Server selbst.

Nach einem Merge nach `main` baut die CD-Pipeline ein unveraenderliches Docker-Image und pushed es nach GHCR:

```text
ghcr.io/0b-ivan/kernel-notes-blog:<commit-sha>
```

Anschliessend wird genau dieses SHA-Image per SSH auf den Hetzner-Host deployed.

Das Production-Compose liegt in:

```text
docker-compose.prod.yml
```

Port-Mapping in Production:

```text
Host 1888 -> Container 8080
```

Der Node-Prozess selbst lauscht im Container weiterhin auf Port `8080`.

Der Deployment-Healthcheck liest den tatsaechlich von Docker veroeffentlichten Host-Port aus und erwartet `1888`. Geprueft wird dann:

```text
http://127.0.0.1:1888/healthz
```

Wenn das Port-Mapping nicht `1888 -> 8080` entspricht oder `/healthz` nicht erfolgreich antwortet, gilt das Deployment als fehlgeschlagen und der Workflow versucht ein Rollback auf das vorherige Image.

### faasd / OpenFaaS

Die bestehende faasd-Variante bleibt erhalten.

Relevante Dateien:

- `faasd/stack.yml`
- `faasd/function-blog/`
- `faasd/install-faasd.sh`

`faasd` ist kein normaler Docker-Compose-Container. Es laeuft auf Linux mit `containerd`, CNI und `systemd`.

## Deployment-User auf Hetzner

GitHub Actions verwendet fuer Production einen eigenen SSH-Account:

```text
blog-deploy
```

Der Account verwendet einen dedizierten SSH-Key und ist fuer die Docker-Deployments Mitglied der Gruppe `docker`.

Das Deployment-Verzeichnis ist:

```text
/opt/Blog
```

Weitere Hinweise stehen unter:

```text
ops/hetzner/README.md
```

## GitHub Environment `production`

Die Zugangsdaten fuer Hetzner liegen als Environment Secrets im GitHub Environment `production`.

Erforderlich:

```text
HETZNER_HOST
HETZNER_PORT
HETZNER_USER
HETZNER_SSH_KEY
HETZNER_KNOWN_HOSTS
```

Aktuell wird SSH auf Port `2222` verwendet und `HETZNER_USER` ist `blog-deploy`.

Das `production`-Environment sollte nur Deployments vom Branch `main` erlauben.

## CI/CD

Es gibt zwei zentrale GitHub-Actions-Workflows:

```text
.github/workflows/ci.yml
.github/workflows/cd.yml
```

### CI

Die CI laeuft fuer Pull Requests und prueft unter anderem:

- Linting
- Unit- und API-Tests mit Coverage
- Post-Frontmatter
- Docker Compose
- Production Compose
- Blog-Image
- OpenFaaS-Function-Image
- Smoke-Test und `/healthz`
- Trivy Security Scan

Lokal:

```bash
npm install
npm run lint
npm run test:coverage
```

### CD

Die CD startet nach einem Merge nach `main`.

Ablauf:

```text
Pull Request
    -> CI + Trivy
    -> Merge nach main
    -> Docker-Image bauen
    -> Push nach GHCR
    -> SSH auf Hetzner
    -> docker compose pull
    -> docker compose up -d
    -> Port-Mapping pruefen
    -> Healthcheck auf :1888/healthz
```

Das Deployment verwendet bewusst den Commit-SHA als Image-Tag und nicht nur `latest`. Dadurch ist nachvollziehbar, welcher Stand gerade laeuft und ein Rollback kann auf das vorherige Image erfolgen.

## Schutz von `main`

`main` soll nicht direkt beschrieben werden. Aenderungen gehen ueber Pull Requests.

Das Repository-Ruleset fuer `main` sollte mindestens erzwingen:

- Pull Request vor Merge
- erfolgreiche Status Checks
- `validate-and-smoke-test`
- `security-trivy`
- Branch muss vor Merge aktuell sein
- keine Force Pushes
- Branch darf nicht geloescht werden

Damit ist der normale Weg:

```text
Feature Branch -> Pull Request -> CI gruen -> Merge -> automatisches Production Deployment
```

## Blogposts

Neue Artikel liegen als Markdown-Dateien im Ordner `posts/`.

Beispiel:

```text
posts/2026-08-19-mein-artikel.md
```

Empfohlenes Frontmatter:

```md
---
title: Mein Artikel
date: 2026-08-19
category: DevOps
excerpt: Kurze Zusammenfassung fuer die Startseite.
tags:
  - Docker
  - CI/CD
---
```

Die Startseite laedt Artikel ueber:

```text
GET /api/posts
```

Ein Artikel ist erreichbar unter:

```text
GET /posts/<slug>
```

## Release-Information im Footer

Das Docker-Image erzeugt beim Build eine `build-info.json`.

Darin stehen:

- Version aus `package.json`
- Build-/Release-Zeitpunkt des Images

Der Footer zeigt dadurch neben `© 2026 Kernel Notes` auch die Version und das letzte Release des aktuell laufenden Images an.

## Wichtige Dateien

- `server.js` - Express-Anwendung und API
- `posts/` - Markdown-Artikel
- `docker-compose.yml` - lokale Entwicklung
- `docker-compose.prod.yml` - Production auf Hetzner
- `Dockerfile` - Blog-Image
- `.github/workflows/ci.yml` - CI
- `.github/workflows/cd.yml` - GHCR + Hetzner Deployment
- `ops/hetzner/` - Setup des Deployment-Users
- `faasd/` - optionale OpenFaaS/faasd-Variante
