---
id: 2026-09-15-staging-gitops-test
version: 1
title: "Staging GitOps Test – wenn du das liest, funktioniert Flux"
status: publish
date: 2026-09-15
created_at: 2026-09-15
updated_at: 2026-09-15
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Ein kleiner End-to-End-Test für den neuen Staging-Workflow: PR nach staging, Image-Build in GitHub Actions, GitOps mit Flux und automatisches Deployment auf K3s."
tags:
  - DevOps
  - Staging
  - GitOps
  - Flux
  - K3s
  - Proxmox
  - Cloudflare
search_queries:
  - query: Funktioniert das automatische Staging Deployment mit Flux?
    maxRank: 1
  - query: Wie teste ich einen GitOps Workflow mit K3s und GitHub Actions?
    maxRank: 1
---

Dieser Beitrag ist absichtlich klein. Er hat nur eine Aufgabe: den neuen Staging-Workflow einmal komplett von Git bis zur laufenden Anwendung zu testen.

Der gewünschte Weg ist:

```text
Feature-Branch
    ↓
Pull Request nach staging
    ↓
GitHub Actions
    ↓
Blog- und Search-Image nach GHCR
    ↓
Image-SHA im GitOps-State aktualisieren
    ↓
Flux erkennt die Änderung
    ↓
K3s rollt die neue Version aus
    ↓
staging-blog.obivan.org
```

Wenn du diesen Text auf der Staging-Seite siehst, ohne dass auf dem Cluster manuell `kubectl set image` oder `kubectl apply` ausgeführt wurde, ist der End-to-End-Pfad erfolgreich.

## Erwartete Merkmale

Die Staging-Seite sollte weiterhin den orange/schwarz gestreiften Rahmen und das `STAGING`-Banner anzeigen. Gleichzeitig muss der Healthcheck unter `/healthz` weiterhin `ok` liefern.

## Danach

Dieser Artikel ist nur ein Smoke-Test und soll nicht nach Production übernommen werden. Nach erfolgreichem Test kann er wieder aus `staging` entfernt werden.
