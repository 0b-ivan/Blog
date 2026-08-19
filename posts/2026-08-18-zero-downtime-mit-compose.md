---
id: 2026-08-18-zero-downtime-mit-compose
version: 1
title: Zero-Downtime Deployments mit Docker Compose
date: 2026-08-18
created_at: 2026-08-18
updated_at: 2026-08-18
author: obivan
reviewed_by: pending
category: DevOps
excerpt: Rolling Updates ohne Kubernetes. So baust du einen stabilen Deployment-Flow mit Healthchecks, Reverse Proxy und sauberem Cutover.
---

Viele Teams brauchen keinen kompletten Kubernetes-Stack, um sauber zu deployen.

Mit Docker Compose kannst du bereits einen robusten Ablauf abbilden, wenn du ein paar Regeln einhaeltst:

1. Healthchecks sind Pflicht.
2. Der Reverse Proxy darf erst auf neue Container umschalten, wenn diese wirklich ready sind.
3. Alte Container erst nach erfolgreichem Cutover beenden.

## Minimaler Ablauf

- Neue Version bauen.
- Neben bestehender Version starten.
- Healthcheck pruefen.
- Traffic umschalten.
- Alte Version geordnet entfernen.

## Fazit

Pragmatisch heisst nicht unsauber. Mit wenigen, klaren Schritten bekommst du sehr viel Stabilitaet ohne Overengineering.
