---
title: Systemd-Timer als bessere Cronjobs
date: 2026-08-04
category: Linux
excerpt: Warum Systemd-Timer oft die bessere Wahl sind: saubere Logs, Abhaengigkeiten und bessere Fehlerbehandlung.
---

Cron ist einfach, aber bei produktiven Jobs fehlt oft Observability.

Systemd-Timer bringen dir:

- klares Logging per journalctl
- Startbedingungen und Abhaengigkeiten
- Restart-Strategien

## Typischer Aufbau

- Eine .service Datei mit deinem Script
- Eine .timer Datei fuer den Zeitplan
- Aktivierung per systemctl enable --now

## Fazit

Wenn Jobs wichtig sind, nutze Tools, die Ausfuehrung und Diagnose gleich mitdenken.
