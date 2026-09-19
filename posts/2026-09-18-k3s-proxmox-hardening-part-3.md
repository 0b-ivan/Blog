---
id: 2026-09-18-k3s-proxmox-hardening-part-3
version: 6
title: "K3s auf Proxmox – Teil III: Hardening, Backups und Observability"
status: publish
date: 2026-09-18
created_at: 2026-09-18
updated_at: 2026-09-18
author: obivan
reviewed_by: pending
category: DevOps
excerpt: "Teil III räumt die Stellen auf, die beim ersten Aufbau noch pragmatisch gelöst waren: feste K3s-Versionen, SOPS/age für Secrets und als nächster Schritt ein Backup, das auch wirklich zurückgespielt wird."
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
Teil I: Der Blog läuft auf K3s.

Teil II: Der Weg von Git bis Staging läuft automatisch über Flux.

Damit war das Setup benutzbar. Aber „läuft“ ist für mich noch nicht dasselbe wie „ich bekomme das in sechs Monaten genauso wieder aufgebaut“.

Genau darum geht es in Teil III.

## Ziel, Architektur und Stand

Teil III hat ein anderes Ziel als die ersten beiden Teile: **Nicht mehr nur „es läuft“, sondern „ich kann es reproduzieren, absichern und nach einem Ausfall wiederherstellen“.**

![Architektur Teil III: gepinntes K3s, Flux-SOPS, verschlüsselte Secrets sowie Backup- und Monitoring-Pfad](/assets/posts/k3s-proxmox-series/teil-iii-architektur.svg)

Ich teile das absichtlich in einzelne Schritte, damit bei einem Fehler klar bleibt, welche Änderung ihn verursacht hat:

| Schritt | Ziel | Stand |
| --- | --- | --- |
| 1. K3s-Pin | Version, Installer-Commit und SHA reproduzierbar machen | erledigt |
| 2. SOPS/age | Secrets verschlüsselt in Git verwalten | erledigt |
| 3. Flux-Decryption | Secrets erst im Cluster entschlüsseln | erledigt |
| 4. Staging-Gate | sicherstellen, dass der Umbau nichts kaputt gemacht hat | erledigt |
| 5. Backup/Restore | Rücksicherung wirklich testen | offen |
| 6. Observability | Node, Pods und öffentlichen Dienst überwachen | offen |

### To-dos für Teil III

- [ ] vollständigen Restore-Test durchführen und dokumentieren.
- [ ] Off-cluster-Backup-Ziel und Retention festlegen.
- [ ] privaten age-Key außerhalb des Clusters gesichert hinterlegen und Restore mitprüfen.
- [ ] Monitoring-Stack auswählen und zuerst nur die wirklich hilfreichen Signale anbinden.
- [ ] Alerts für Node, Workloads und öffentlichen Healthcheck definieren.
- [ ] Upgrade- und Rollback-Ablauf für K3s dokumentieren.

Ich will bei einem kaputten Node nicht überlegen müssen, welche K3s-Version damals zufällig im `stable`-Channel lag. Ich will Secrets nicht per Hand im Cluster verteilen. Und ein Backup ist für mich erst dann ein Backup, wenn ich weiß, wie ich es wieder einspiele.

Der Plan ist deshalb bewusst in einzelne Baustellen aufgeteilt:

| Schritt | Was ich erreichen will | Stand |
| --- | --- | --- |
| K3s Bootstrap | exakt dieselbe Version und denselben Installer wieder bekommen | umgesetzt |
| Secrets | GHCR- und Cloudflare-Secrets verschlüsselt über Git verwalten | umgesetzt und getestet |
| Backup / Restore | Datastore sichern und eine Rücksicherung wirklich durchführen | als Nächstes |
| Observability | Node, Pods und öffentlichen Blog sinnvoll überwachen | danach |

Ich ändere diese Punkte absichtlich nacheinander. Wenn ich gleichzeitig Kubernetes upgrade, Secrets umbaue und Monitoring einziehe, weiß ich beim ersten Fehler wieder nicht, welche Änderung ihn verursacht hat.

## 1. `stable` war mir zu schwammig

Mein erstes Ansible-Playbook hat K3s über den `stable`-Channel installiert.

Das ist bequem:

```text
Playbook ausführen
      ↓
stable
      ↓
K3s läuft
```

Nur ist `stable` kein fester Zustand.

Heute kann das Version X sein, ein paar Wochen später Version Y. Dasselbe Git-Repository baut dann plötzlich einen anderen Node.

Mein laufender Cluster war zu diesem Zeitpunkt auf:

```text
v1.36.4+k3s1
```

Also habe ich erstmal genau diesen Stand festgenagelt. Noch kein Upgrade, keine neue Baustelle – nur Reproduzierbarkeit.

## 2. Ich pinne nicht nur die K3s-Version

Nur `INSTALL_K3S_VERSION` zu setzen war mir zu wenig.

Ich wollte drei Dinge festhalten:

```text
K3s:
v1.36.4+k3s1

Installer-Commit:
4dedb15be78017a8ddd5b9e81acd44f3481078ed

SHA-256 von install.sh:
46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad
```

Die Werte liegen zentral in:

```text
infra/ansible/group_vars/k3s_servers.yml
```

Damit lade ich den Installer nicht mehr von einer beweglichen `get.k3s.io`-URL, sondern direkt aus genau diesem Upstream-Commit.

Das Playbook:

[K3s-Version mit Ansible fest pinnen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/01-k3s-version-pin.yml "snippet:yaml")

Wenn der Hash nicht passt, wird nicht installiert.

Das ist simpel, aber genau die Art Fehler, die ich lieber beim Bootstrap sehe als später auf einem halb aktualisierten Node.

## 3. Der Installer prüft danach auch das eigentliche Binary

Die Checksumme von `install.sh` sagt natürlich noch nichts über das heruntergeladene K3s-Binary aus.

Der offizielle Installer lädt für die gewünschte Release-Version zusätzlich die passende `sha256sum-<arch>.txt` und prüft das Binary.

Damit sieht die Kette bei mir so aus:

```text
Git
 ↓
gepinntes install.sh
 ↓
eigener SHA-256-Check
 ↓
INSTALL_K3S_VERSION=v1.36.4+k3s1
 ↓
K3s Release-Checksumme
 ↓
Binary
```

Ich prüfe also beide Stufen und nicht nur das Shellskript.

## 4. Ein K3s-Upgrade ist jetzt ein normaler Git-Change

Das Playbook liest zuerst die installierte Version.

Passt sie zum Pin, macht es nichts.

Passt sie nicht, wird genau die konfigurierte Version installiert und danach nochmal mit `k3s --version` geprüft.

Ein Upgrade sieht damit nicht mehr nach:

```bash
curl -sfL https://get.k3s.io | sh -
```

aus, sondern nach:

```text
Version ändern
   ↓
Installer-Commit prüfen
   ↓
neuen SHA-256 eintragen
   ↓
PR
   ↓
Release Notes lesen
   ↓
Ansible laufen lassen
   ↓
Cluster prüfen
```

Das gefällt mir deutlich besser, weil die Entscheidung für ein Upgrade im Git-Verlauf sichtbar bleibt.

## 5. Warum ich nicht direkt auf die nächste Minor-Version gegangen bin

Zu dem Zeitpunkt war K3s 1.37 schon verfügbar.

Ich habe trotzdem zuerst 1.36.4 gepinnt.

Der Grund ist ziemlich unspektakulär: Ich wollte zwei Änderungen nicht miteinander vermischen.

```text
Änderung A: Bootstrap reproduzierbar machen
Änderung B: Kubernetes-Version wechseln
```

Erst A sauber machen, testen, dann B als eigenen Change. Falls beim Upgrade später etwas schiefgeht, weiß ich wenigstens, wonach ich suchen muss.

## 6. Die nächste unsaubere Ecke waren die Secrets

Bis dahin lagen zwei wichtige Secrets nur im Cluster:

```text
blog-staging/ghcr-pull
cloudflare/cloudflared-token
```

Das funktioniert technisch. GitOps ist es aber nicht.

Wenn ich den Cluster neu aufbaue, fehlen genau diese Dinge und ich muss mich wieder daran erinnern, wie ich sie damals angelegt habe.

Klartext im Repository kommt natürlich nicht infrage. Deshalb habe ich SOPS + age genommen.

Flux kann SOPS direkt beim Reconcile entschlüsseln. Im Repository liegen nur verschlüsselte Secret-Manifeste. Der private age-Key bleibt außerhalb von Git.

## 6.1 Den age-Key will ich nicht aus Versehen committen

Der private Key liegt bei mir standardmäßig unter:

```text
~/.config/sops/age/keys.txt
```

Das Bootstrap-Skript prüft extra, dass der Pfad nicht innerhalb des Repositories liegt und schreibt den privaten Key nicht ins Terminal:

[SOPS-age-Key für Flux vorbereiten](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/02-bootstrap-sops-age.sh "snippet:bash")

Flux braucht denselben Key im Cluster. Dort landet er als:

```text
flux-system/sops-age
```

mit dem Eintrag:

```text
identity.agekey
```

Wichtig ist aber: **Der Key im Cluster ist nicht mein Backup.**

Wenn der Cluster komplett weg ist, brauche ich den privaten age-Key trotzdem noch irgendwo außerhalb davon.

## 6.2 Die vorhandenen Secrets habe ich aus dem laufenden Cluster übernommen

Ich wollte nicht neue GHCR- oder Cloudflare-Credentials erfinden, obwohl die vorhandenen bereits funktionieren.

Darum liest das Skript die beiden Secrets direkt aus Kubernetes, legt die Klartextdaten nur in einem temporären Verzeichnis ab und verschlüsselt sie sofort mit SOPS:

[Bestehende Cluster-Secrets mit SOPS verschlüsseln](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/03-export-encrypt-staging-secrets.sh "snippet:bash")

Im Repository landen nur:

```text
infra/kubernetes/staging/secrets/
├── ghcr-pull.sops.yaml
└── cloudflared-token.sops.yaml
```

Name und Namespace dürfen lesbar bleiben. Die eigentlichen Werte unter `data` beziehungsweise `stringData` sind verschlüsselt.

## 6.3 Bei SOPS ist die Reihenfolge wichtiger als gedacht

Hier bin ich beim ersten Rollout tatsächlich in einen kleinen Bootstrap-Zirkel gelaufen.

Flux soll die verschlüsselten Secrets aus Git lesen. Dafür muss die laufende Kustomization aber bereits wissen, **wie** sie SOPS entschlüsseln soll.

Wenn ich zuerst nur die verschlüsselten Dateien in Git aktiviere, sagt Flux sinngemäß:

```text
Secret ... is SOPS encrypted,
configuring decryption is required
```

Wenn ich umgekehrt Decryption aktiviere, aber Key oder Secret-Dateien fehlen, ist der Zustand ebenfalls kaputt.

Darum prüft mein Skript zuerst alles, bevor es überhaupt den Git-Zustand vorbereitet:

```text
sops-age vorhanden?
      ↓
beide .sops.yaml vorhanden?
      ↓
lokal entschlüsselbar?
      ↓
Flux-Decryption eintragen
      ↓
Secret-Ressourcen in Kustomize aufnehmen
```

[Flux-SOPS-Git-Zustand vorbereiten](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/04-activate-flux-sops.sh "snippet:bash")

Das Skript committed absichtlich nichts. Ich will danach immer noch ganz normal `git diff`, CI und den PR sehen.

## 6.4 Der erste SOPS-Rollout braucht einmal Hilfe

Der interessante Haken kam danach.

Der gewünschte SOPS-Zustand lag bereits in `staging`. Die **laufende** Flux-Kustomization hatte aber noch keine Decryption-Konfiguration und konnte deshalb genau den Commit nicht anwenden, der diese Konfiguration enthält.

Bei mir sah das so aus:

```text
Ready=False
Secret/blog-staging/ghcr-pull is SOPS encrypted,
configuring decryption is required for this secret to be reconciled
```

Klassisches Henne-Ei-Problem.

Dafür gibt es jetzt einen einmaligen Bootstrap:

[Live-Flux einmalig für SOPS bootstrappen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/05-bootstrap-live-flux-sops.sh "snippet:bash")

Das Skript macht den Live-Patch **erst**, wenn es vorher geprüft hat, dass in `origin/staging` bereits alles sauber vorbereitet ist:

- Decryption-Konfiguration
- beide Secret-Ressourcen
- echte SOPS-Ciphertexte

Danach patcht es die laufende Kustomization, startet den Reconcile und wartet auf `Ready=True`.

Bei meinem Rollout kam anschließend:

```text
READY=True
Applied revision: staging@sha1:4d7e5ab8b99421496349b4833e1355efcf4e60bb
```

Und der öffentliche Staging-Check war danach ebenfalls grün.

Genau so wollte ich es: einmaliger Bootstrap, danach wieder normaler GitOps-Betrieb.

## 6.5 CI soll mich vor einem dummen Secret-Commit schützen

Nur in die README zu schreiben „bitte keine Secrets committen“ reicht mir nicht.

Deshalb läuft bei jedem PR:

```bash
bash scripts/check-gitops-secrets.sh
```

Der Check blockiert unter anderem:

- getrackte `.agekey`-Dateien
- Secret-Dateien ohne SOPS-Metadaten
- Klartext unter `data` oder `stringData`
- SOPS-Secrets ohne aktivierte Flux-Decryption
- Decryption ohne die erwarteten verschlüsselten Secret-Ressourcen

Das ersetzt keinen sauberen Umgang mit Credentials. Aber es fängt genau die Fehler ab, die beim schnellen Basteln sonst irgendwann im Git-Verlauf landen.

## Wo ich nach diesem Schritt stehe

Aktuell ist erledigt:

```text
K3s stable Channel          raus
K3s-Version                 gepinnt
Installer-Commit            gepinnt
Installer-SHA-256           gepinnt
Binary-Checksumme           geprüft
Upgrade                     bewusster Git-Change

SOPS + age                  eingerichtet
GHCR Secret                 verschlüsselt in Git
Cloudflare Secret           verschlüsselt in Git
Flux Decryption             aktiv
Secret-Guard in CI          aktiv
Staging nach Migration      erfolgreich geprüft
```

Das ist noch kein „fertig gehärteter Cluster“. Aber zwei Stellen, die mich beim Wiederaufbau ziemlich sicher genervt hätten, sind jetzt sauberer.

Als Nächstes kommt der Punkt, bei dem sich entscheidet, ob das Ganze wirklich belastbar ist:

**Backup und Restore.**

Nicht nur ein Cronjob, der irgendwo Dateien hinlegt, sondern ein Restore, den ich auf einem frischen beziehungsweise bewusst zurückgesetzten Zustand wirklich teste.

Danach kommt Monitoring. Erst wenn ich weiß, dass ich den Cluster wiederherstellen kann, lohnt sich für mich die nächste Runde an Metriken und Alarmen.
