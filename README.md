# Kernel Notes - Docker Compose + faasd

Dieses Projekt hat jetzt **zwei Betriebsarten**:

1. **Lokal mit Docker Compose** (schneller Preview-Run)
2. **Deployment als OpenFaaS Function auf faasd**

Wichtig: `faasd` ist kein normaler Docker-Compose-Container. Es laeuft auf Linux mit `containerd`, CNI und `systemd`.

## 1) Lokal per Docker Compose starten

Voraussetzung: Docker Engine + Docker Compose Plugin

```bash
docker compose up -d --build
```

Dann im Browser:

- http://localhost:8080

Stoppen:

```bash
docker compose down
```

## 2) faasd auf einem Linux-Host installieren

Nimm dafuer idealerweise einen dedizierten Host/VM (ohne Docker-Workloads auf derselben Maschine).

```bash
chmod +x faasd/install-faasd.sh
./faasd/install-faasd.sh
```

Nach Installation:

```bash
sudo cat /var/lib/faasd/secrets/basic-auth-password
```

## 3) Blog als Function zu faasd deployen

In [faasd/stack.yml](faasd/stack.yml) musst du den Image-Namen anpassen:

- `ghcr.io/your-user/kernel-notes-function:latest` -> dein Registry-Pfad

Dann:

```bash
cd faasd
faas-cli up -f stack.yml
```

Falls noetig vorher einloggen:

```bash
export OPENFAAS_URL=http://<FAASD_HOST>:8080
echo "<PASSWORT>" | faas-cli login --username admin --password-stdin
```

Aufruf danach:

- http://<FAASD_HOST>:8080/function/kernel-notes

## Struktur

- `docker-compose.yml`: lokale Compose-Umgebung fuer den Blog
- `Dockerfile`: Image fuer lokalen Blog-Container
- `faasd/stack.yml`: OpenFaaS-Stack fuer faasd
- `faasd/function-blog/`: Function-Image mit gleicher Blog-UI

## 4) CI/CD mit GitHub Actions

Es gibt zwei Workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/cd.yml`

### CI (bei Push + PR)

- validiert `docker compose config`
- baut beide Images (Blog + Function)
- startet den Stack und prueft `http://127.0.0.1:8080/healthz`

### CD (bei Push auf `main` + manuell)

- baut und pushed Images nach GHCR:
	- `ghcr.io/<owner>/kernel-notes-blog:<sha>` + `latest`
	- `ghcr.io/<owner>/kernel-notes-function:<sha>` + `latest`
- deployed die Function `kernel-notes` automatisch nach faasd

### GitHub Secrets fuer faasd-Deploy

Lege in deinem Repo unter Settings -> Secrets and variables -> Actions an:

- `OPENFAAS_URL` (z. B. `http://dein-host:8080`)
- `OPENFAAS_USERNAME` (meist `admin`)
- `OPENFAAS_PASSWORD` (aus `/var/lib/faasd/secrets/basic-auth-password`)
- optional: `OPENFAAS_INSECURE` = `true` (nur wenn TLS self-signed)

Wenn diese Secrets fehlen, wird nur gebaut/gepusht, aber nicht nach faasd deployed.
