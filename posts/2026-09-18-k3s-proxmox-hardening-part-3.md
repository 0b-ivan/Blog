---
id: 2026-09-18-k3s-proxmox-hardening-part-3
version: 4
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
  - file: "02-bootstrap-sops-age.sh"
    title: "SOPS-age-Key für Flux vorbereiten"
    description: "Erzeugt oder verwendet einen lokalen age-Key und legt daraus flux-system/sops-age an, ohne den privaten Key auszugeben."
    type: "Shellskript"
    language: "bash"
  - file: "03-export-encrypt-staging-secrets.sh"
    title: "Bestehende Cluster-Secrets mit SOPS verschlüsseln"
    description: "Exportiert GHCR- und Cloudflare-Secrets nur temporär und schreibt ausschließlich SOPS-verschlüsselte Manifeste ins Repository."
    type: "Shellskript"
    language: "bash"
  - file: "04-activate-flux-sops.sh"
    title: "Flux-SOPS-Git-Zustand vorbereiten"
    description: "Prüft Key und verschlüsselte Manifeste und bereitet Decryption sowie Secret-Ressourcen im Git-Sollzustand vor."
    type: "Shellskript"
    language: "bash"
  - file: "05-bootstrap-live-flux-sops.sh"
    title: "Live-Flux einmalig für SOPS bootstrappen"
    description: "Prüft zuerst den bereits gemergten staging-Sollzustand, aktiviert dann einmalig SOPS in der laufenden Flux-Kustomization und wartet auf Ready."
    type: "Shellskript"
    language: "bash"
---

Teil I hat den Blog auf K3s gebracht. Teil II hat daraus einen GitOps-Pfad mit Flux, verifiziertem Staging und manueller Production-Freigabe gemacht.

Teil III beginnt an einer anderen Stelle: **Der Aufbau funktioniert bereits. Jetzt muss er auch reproduzierbar, wiederherstellbar und beobachtbar werden.**

Der aktuelle Hardening-Plan besteht aus vier getrennten Schritten:

| Schritt | Ziel | Status |
| --- | --- | --- |
| K3s Bootstrap | Version, Installationsquelle und Installer-Hash reproduzierbar festschreiben | umgesetzt |
| Secrets | GHCR- und Cloudflare-Credentials verschlüsselt über GitOps verwalten | umgesetzt und verifiziert |
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

## 6. Secrets: SOPS + age ohne halbfertigen Flux-Zustand

Noch nicht GitOps-tauglich sind aktuell insbesondere:

```text
blog-staging/ghcr-pull
cloudflare/cloudflared-token
```

Diese Secrets existieren bereits im Cluster, aber nicht im Git-Sollzustand.

Flux unterstützt SOPS direkt über `spec.decryption`. Für age kann ein Kubernetes-Secret mit einem Schlüssel verwendet werden, dessen Name auf `.agekey` endet. Die eigentlichen Kubernetes-Secrets bleiben dabei als verschlüsselte YAML-Dateien im Repository; entschlüsselt wird erst im Cluster.

Die Migration wird absichtlich in drei Phasen getrennt.

Auf dem Admin-Rechner werden dafür `kubectl`, `age-keygen` und `sops` benötigt. Die Hilfsskripte brechen ab, wenn eines dieser Werkzeuge fehlt.

### 6.1 Age-Key erzeugen und nur außerhalb von Git speichern

Der private Schlüssel liegt standardmäßig unter:

```text
~/.config/sops/age/keys.txt
```

Das Bootstrap-Skript verweigert einen Pfad innerhalb des Git-Repositories und gibt den privaten Key nicht auf stdout aus.

[SOPS-age-Key für Flux vorbereiten](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/02-bootstrap-sops-age.sh "snippet:bash")

Der gleiche Key wird anschließend als Kubernetes-Secret `flux-system/sops-age` hinterlegt. Der Key-Eintrag heißt `identity.agekey`, damit der Flux-Kustomize-Controller ihn eindeutig als age-Identity erkennt.

Der private Schlüssel muss zusätzlich außerhalb des Clusters gesichert werden. Sonst wäre ein vollständiger Clusterverlust gleichzeitig ein Verlust der Fähigkeit, die Git-Secrets zu entschlüsseln.

### 6.2 Bestehende Secrets exportieren, aber niemals im Worktree als Klartext ablegen

Der zweite Schritt liest die bereits funktionierenden Secrets direkt aus Kubernetes:

```text
blog-staging/ghcr-pull
cloudflare/cloudflared-token
```

Klartext bzw. die Kubernetes-`data`-Werte landen nur in einem per `mktemp` erzeugten temporären Verzeichnis. Von dort werden sie unmittelbar mit SOPS und dem öffentlichen age-Recipient verschlüsselt.

[Bestehende Cluster-Secrets mit SOPS verschlüsseln](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/03-export-encrypt-staging-secrets.sh "snippet:bash")

Im Repository entstehen danach ausschließlich:

```text
infra/kubernetes/staging/secrets/
├── ghcr-pull.sops.yaml
└── cloudflared-token.sops.yaml
```

SOPS verschlüsselt nur `data` beziehungsweise `stringData`. `apiVersion`, `kind`, `metadata`, Name und Namespace bleiben lesbar, damit Flux und Kustomize die Ressourcen verarbeiten können.

### 6.3 Flux-Decryption erst aktivieren, wenn Key und Ciphertext geprüft sind

Der kritische Teil ist die Reihenfolge.

Würde `spec.decryption` aktiviert, bevor `flux-system/sops-age` vorhanden ist, könnte die Kustomization nicht mehr sauber reconciliieren. Würden umgekehrt verschlüsselte Secret-Manifeste ohne Decryption in die aktive Kustomization aufgenommen, wären die Ressourcen ebenfalls nicht anwendbar.

Deshalb prüft das Aktivierungsskript zuerst:

```text
sops-age Secret vorhanden?
        ↓
beide .sops.yaml vorhanden?
        ↓
lokal mit demselben Key entschlüsselbar?
        ↓
erst jetzt gotk-sync.yaml patchen
        ↓
erst jetzt Secret-Ressourcen in Kustomize aufnehmen
```

[Flux-SOPS-Git-Zustand vorbereiten](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/04-activate-flux-sops.sh "snippet:bash")

Das Skript committed nichts selbst. Nach der Änderung bleiben `git diff`, CI und der normale Staging-PR weiterhin die Freigabestellen.

### 6.4 Der einmalige Flux-Bootstrap-Zirkel

Beim ersten echten Rollout zeigte sich ein wichtiger Bootstrap-Effekt: Die laufende `flux-system`-Kustomization kann ein Git-Manifest mit SOPS-Secrets nicht anwenden, solange ihre **Live-Spec** noch keine Decryption-Konfiguration enthält. Gleichzeitig liegt genau diese neue Decryption-Spec erst im Git-Commit, den Flux anwenden soll.

Der beobachtete Zustand war eindeutig:

```text
Ready=False
Secret/blog-staging/ghcr-pull is SOPS encrypted,
configuring decryption is required for this secret to be reconciled
```

Die Lösung ist ein einmaliger, kontrollierter Live-Bootstrap **nachdem** der gewünschte SOPS-Zustand bereits in `origin/staging` liegt:

[Live-Flux einmalig für SOPS bootstrappen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/05-bootstrap-live-flux-sops.sh "snippet:bash")

Das Skript verweigert den Patch, solange `origin/staging` nicht bereits Decryption, beide Secret-Ressourcen und echte SOPS-Ciphertexte enthält. Erst danach patcht es die laufende Kustomization, stößt den Reconcile an und wartet auf `Ready=True`.

Im realen Rollout wechselte Flux danach auf:

```text
READY=True
Applied revision: staging@sha1:4d7e5ab8b99421496349b4833e1355efcf4e60bb
```

Der anschließende öffentliche Staging-Gate lief vollständig erfolgreich durch.


### 6.5 CI blockiert Klartext und halbfertige Migrationen

Zusätzlich läuft jetzt bei jedem PR:

```text
bash scripts/check-gitops-secrets.sh
```

Der Guard blockiert unter anderem:

- getrackte `.agekey`-Dateien
- Secret-Dateien ohne SOPS-Metadaten
- Klartextwerte unter `data` oder `stringData`
- verschlüsselte Secret-Dateien ohne aktivierte Flux-Decryption
- aktivierte Flux-Decryption ohne die erwarteten verschlüsselten Secret-Ressourcen

Damit reicht nicht mehr nur die Konvention „keine Secrets committen“. Der Zustand wird maschinell geprüft.

### 6.6 Verifizierter Secret-Rollout

Die Migration wurde gegen den laufenden Staging-Cluster durchgeführt. Beide bestehenden Secrets wurden aus Kubernetes gelesen, lokal mit SOPS verschlüsselt und als Ciphertext committed.

Nach dem einmaligen Live-Bootstrap konnte Flux den neuen Git-Sollzustand erfolgreich anwenden. Der Staging-Deploy inklusive öffentlichem Health-/Build-Gate lief anschließend vollständig grün durch.

Der reproduzierbare Übergang ist damit:

```text
age-Key außerhalb Git
        ↓
sops-age im Cluster
        ↓
bestehende Secrets exportieren + verschlüsseln
        ↓
Git-Sollzustand vorbereiten
        ↓
PR + CI
        ↓
Merge nach staging
        ↓
einmaliger Live-Flux-SOPS-Bootstrap
        ↓
Flux Ready=True
        ↓
öffentlicher Staging-Gate
```

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
SOPS/age Migration            umgesetzt und im Staging verifiziert
GitOps Secret Guard           in CI verankert
```

Als nächster Teil-III-Schritt folgen Backup und ein tatsächlich getesteter Restore des K3s-Datastores.
