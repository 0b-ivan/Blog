---
id: 2026-08-12-cloudflare-tunnel-haerten
version: 1
title: "Cloudflare Tunnel härten: Die 7 wichtigsten Checks"
status: archived
date: 2026-08-12
created_at: 2026-08-12
updated_at: 2026-08-12
author: obivan
reviewed_by: pending
category: Security
excerpt: Access Policies, Service Tokens und mTLS richtig kombinieren, damit dein Tunnel kein Einfallstor wird.
---

Cloudflare Tunnel ist schnell eingerichtet. Sicher betrieben wird er durch konsequente Guardrails.

## Meine 7 Basis-Checks

1. Kein offenes Dashboard ohne Access.
2. Service Tokens für Machine-to-Machine.
3. mTLS für sensible Admin-Routen.
4. Logging aktivieren und aufbewahren.
5. Rate Limiting auf Login-Routen.
6. Regeln regelmäßig testen.
7. Break-Glass-Zugang dokumentieren.

## Fazit

Das Setup dauert einmal 30 Minuten länger, spart dir aber später sehr viel Incident-Aufwand.
