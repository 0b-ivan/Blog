---
id: 2026-09-18-k3s-proxmox-hardening-part-3
version: 2
title: "K3s auf Proxmox – Teil III: Hardening, Backups und Observability"
status: publish
date: 2026-09-18
created_at: 2026-09-18
updated_at: 2026-09-18
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Teil III härtet das bestehende K3s-Staging schrittweise: reproduzierbare Versionen, GitOps-taugliche Secrets, getestete Backups und Restore sowie Observability ohne unnötige öffentliche Angriffsfläche."
tags:
  - Kubernetes
  - K3s
  - Proxmox
  - Hardening
  - Ansible
  - GitOps
  - Backup
  - Observability
  - Self-Hosting
  - DevOps
search_queries:
  - query: Wie pinne ich eine K3s Version reproduzierbar mit Ansible?
    maxRank: 1
  - query: Wie härte ich einen K3s Homelab Cluster mit Secrets Backups und Monitoring?
    maxRank: 1
  - query: Wie upgrade ich K3s kontrolliert statt immer den stable Channel zu installieren?
    maxRank: 1
snippets:
  - file: "01-k3s-version-pin.yml"
    title: "K3s-Version mit Ansible fest pinnen"
    description: "Installiert nur bei Versionsabweichung und prüft den auf einen konkreten Upstream-Commit gepinnten Installer per SHA-256."
    type: "Ansible-Playbook"
    language: "yaml"
---

Teil I hat den Blog auf K3s gebracht. Teil II hat daraus einen GitOps-Pfad mit Flux, verifiziertem Staging und manueller Production-Freigabe gemacht.

Teil III beginnt an einer anderen Stelle: **Der Aufbau funktioniert bereits. Jetzt muss er auch reproduzierbar, wiederherstellbar und beobachtbar werden.**

Der aktuelle Hardening-Plan besteht aus vier getrennten Schritten:

| Schritt | Ziel | Status |
| --- | --- | --- |
| K3s Bootstrap | Version, Installationsquelle und Installer-Hash reproduzierbar festschreiben | umgesetzt |
| Secrets | GHCR- und Cloudflare-Credentials verschlüsselt über GitOps verwalten | als Nächstes |
| Backup / Restore | K3s-Datastore und kritische Konfiguration sicher sichern und Rücksicherung testen | geplant |
| Observability | Node, Pods, Deployments und externen Healthcheck überwachen | geplant |

Die Schritte werden bewusst getrennt umgesetzt. Ein Hardening-Change soll nicht gleichzeitig ein Kubernetes-Upgrade, eine neue Secret-Lösung und ein Monitoring-Stack sein.

## 1. Das erste Problem: `stable` ist kein reproduzierbarer Zustand

Der bisherige Ansible-Bootstrap verwendete den K3s-`stable`-Channel.

Das ist bequem, bedeutet aber:

```text
Playbook heute
    ↓
stable
    ↓
Version X

dasselbe Playbook später
    ↓
stable
    ↓
Version Y
```

Damit beschreibt Git nicht vollständig, welche Kubernetes-Version auf einem frisch aufgebauten Node landet.

Der bestehende Node läuft auf:

```text
v1.36.4+k3s1
```

Teil III friert zunächst genau diesen bekannten Stand ein. Ein Wechsel auf eine neuere K3s-Version wird damit zu einem eigenen, sichtbaren Commit.

## 2. Version, Installer-Quelle und Installer-Hash gemeinsam pinnen

Die Versionswerte liegen jetzt zentral unter:

```text
infra/ansible/group_vars/k3s_servers.yml
```

Festgeschrieben werden drei Dinge:

```text
K3s Release:
v1.36.4+k3s1

Upstream-Commit des Installers:
4dedb15be78017a8ddd5b9e81acd44f3481078ed

SHA-256 des install.sh aus diesem Commit:
46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad
```

Der Installer wird damit nicht mehr über die bewegliche URL `get.k3s.io` bezogen. Ansible lädt die Datei direkt aus dem konkreten K3s-Upstream-Commit und akzeptiert sie nur, wenn der lokal gepinnte SHA-256 stimmt.

Das vollständige, reduzierte Beispiel:

[K3s-Version mit Ansible fest pinnen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/01-k3s-version-pin.yml "snippet:yaml")

## 3. Auch das K3s-Binary wird verifiziert

Die Prüfung des Installer-Skripts ersetzt nicht die Prüfung des eigentlichen K3s-Binaries.

Der offizielle K3s-Installer lädt für die angeforderte Release-Version die passende `sha256sum-<arch>.txt` und vergleicht den Hash des Binaries vor der Installation.

Der Ablauf ist damit:

```text
Git
 ↓
gepinnter Installer-Commit
 ↓
lokaler SHA-256-Pin des Installers
 ↓
INSTALL_K3S_VERSION=v1.36.4+k3s1
 ↓
offizielle Release-Checksumme
 ↓
verifiziertes K3s-Binary
```

Damit sind die zuvor beweglichen Bestandteile kontrolliert und beide Download-Stufen werden geprüft.

## 4. Das Playbook wird gleichzeitig zum kontrollierten Upgrade-Pfad

Das Playbook prüft zuerst die aktuell installierte Version.

Stimmt sie bereits mit `k3s_version` überein, passiert keine Neuinstallation.

Weicht sie ab, wird genau die konfigurierte Version installiert. Anschließend prüft Ansible erneut `k3s --version` und bricht ab, falls der erwartete Pin nicht erreicht wurde.

Ein späteres Upgrade besteht deshalb nicht aus einem spontanen `curl | sh`, sondern aus einem überprüfbaren Git-Change:

```text
k3s_version ändern
        +
passenden Upstream-Commit pinnen
        +
neuen Installer-SHA-256 hinterlegen
        ↓
Pull Request
        ↓
Release Notes prüfen
        ↓
Ansible ausführen
        ↓
Version verifizieren
        ↓
Workloads testen
```

Damit bleiben **Upgrade-Entscheidung** und **Upgrade-Ausführung** voneinander getrennt.

## 5. Warum noch nicht direkt auf K3s 1.37 wechseln?

Zum Zeitpunkt dieses Schritts ist K3s 1.37 bereits verfügbar. Der laufende Node verwendet jedoch 1.36.4.

Teil III startet absichtlich ohne Versionssprung. Das Ziel dieses Commits ist zunächst Reproduzierbarkeit. Ein Upgrade auf eine neue Kubernetes-Minor-Version bringt ein anderes Risikoprofil mit und bekommt deshalb einen eigenen Change mit eigener Prüfung.

## Nächster Schritt: Secrets aus dem manuellen Zustand holen

Noch nicht GitOps-tauglich sind aktuell insbesondere:

```text
blog-staging/ghcr-pull
cloudflare/cloudflared-token
```

Diese Secrets werden bisher außerhalb des Git-Sollzustands angelegt.

Als nächster Teil-III-Schritt ist deshalb vorgesehen:

```text
SOPS + age
   ↓
verschlüsselte Secret-Manifeste in Git
   ↓
Flux entschlüsselt erst im Cluster
   ↓
keine Klartext-Credentials im Repository
```

Dabei wird die Flux-Decryption erst aktiviert, nachdem der Age-Key im Cluster vorhanden und verifiziert ist. So bleibt das bestehende Staging während der Migration funktionsfähig.

## Zwischenstand

Nach diesem ersten Hardening-Schritt ist der Cluster noch nicht vollständig gehärtet. Ein wichtiger Bootstrap-Blindspot ist aber beseitigt:

```text
K3s stable Channel            entfernt
exakte K3s-Version            gepinnt
Installer-Quellstand          gepinnt
Installer-SHA-256             gepinnt
Release-Binary-Checksumme     weiterhin geprüft
Versionsabweichung            von Ansible erkannt
Upgrade                       bewusster Git-Change
```

Als Nächstes folgt die Secret-Migration mit SOPS und age.
