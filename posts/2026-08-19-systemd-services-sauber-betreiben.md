---
id: 2026-08-19-systemd-services-sauber-betreiben
version: 1
title: systemd Services sauber betreiben
date: 2026-08-19
created_at: 2026-08-19
updated_at: 2026-08-19
author: obivan
reviewed_by: pending
category: Linux
excerpt: Ein praktischer Leitfaden für robuste systemd-Services mit Restart-Strategie, Healthchecks und klaren Logs.
tags: Linux, systemd, Operations, Reliability
---

`systemd` ist mehr als nur `systemctl start`.

Wenn Services stabil laufen sollen, helfen ein paar saubere Defaults.

## Beispiel Unit

```ini
[Unit]
Description=Kernel Notes API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/kernel-notes
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Restart-Strategie bewusst setzen

- `Restart=always` für langlebige Daemons
- `RestartSec` nutzen, um Crash-Loops zu entschleunigen

::: tip Praxis
Wenn ein Prozess wegen Konfigurationsfehler abstürzt, ist ein kurzer Delay Gold wert für Debugging.
:::

## Logs zentral lesen

```bash
journalctl -u kernel-notes -f
```

Für letzte Fehler:

```bash
journalctl -u kernel-notes -n 200 --no-pager
```

## Healthchecks und Abhängigkeiten

Wenn dein Service externe Abhängigkeiten hat (DB, Cache, API), dokumentiere sie im Unit-File und in Runbooks.

Siehe auch: [[Systemd Timer Statt Cron]]

## Mermaid: Lebenszyklus

```mermaid
flowchart TD
  A[Start] --> B[Running]
  B --> C{Crash?}
  C -- Ja --> D[RestartSec warten]
  D --> A
  C -- Nein --> E[Stable]
```

## Fazit

Mit sauberem Unit-File, Restart-Strategie und klaren Logs wird `systemd` zum soliden Betriebsfundament statt Blackbox.
