---
id: 2026-08-04-systemd-timer-statt-cron
version: 1
title: Systemd-Timer als bessere Cronjobs
status: archived
date: 2026-08-04
created_at: 2026-08-04
updated_at: 2026-08-04
author: obivan
reviewed_by: pending
category: Linux
excerpt: "Warum Systemd-Timer oft die bessere Wahl sind: saubere Logs, Abhängigkeiten und bessere Fehlerbehandlung."
---

Cron ist einfach, aber bei produktiven Jobs fehlt oft Observability.

Systemd-Timer bringen dir:

- klares Logging per journalctl
- Startbedingungen und Abhängigkeiten
- Restart-Strategien

## Typischer Aufbau

- Eine .service Datei mit deinem Script
- Eine .timer Datei für den Zeitplan
- Aktivierung per systemctl enable --now

## Fazit

Wenn Jobs wichtig sind, nutze Tools, die Ausführung und Diagnose gleich mitdenken.
