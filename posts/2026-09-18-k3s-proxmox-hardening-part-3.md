---
id: 2026-09-18-k3s-proxmox-hardening-part-3
version: 8
title: 'K3s auf Proxmox – Teil III: Feste Versionen und verschlüsselte Secrets'
status: publish
date: 2026-09-18T00:00:00.000Z
created_at: 2026-09-18T00:00:00.000Z
updated_at: 2026-09-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: DevOps
excerpt: >-
  Teil III macht den bestehenden K3s-Aufbau reproduzierbarer: feste Versionen,
  verschlüsselte Secrets in Git und als nächster Schritt ein Backup, das auch
  wirklich zurückgespielt wird.
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
  - query: >-
      Wie härte ich einen K3s Homelab Cluster mit Secrets Backups und
      Monitoring?
    maxRank: 1
  - query: >-
      Wie upgrade ich K3s kontrolliert statt immer den stable Channel zu
      installieren?
    maxRank: 1
snippets:
  - file: 01-k3s-version-pin.yml
    title: K3s-Version mit Ansible fest pinnen
    description: >-
      Installiert nur bei Versionsabweichung und prüft den auf einen konkreten
      Upstream-Commit gepinnten Installer per SHA-256.
    type: Ansible-Playbook
    language: yaml
  - file: 02-bootstrap-sops-age.sh
    title: SOPS-age-Key für Flux vorbereiten
    description: >-
      Erzeugt oder verwendet einen lokalen age-Key und legt daraus
      flux-system/sops-age an, ohne den privaten Key auszugeben.
    type: Shellskript
    language: bash
  - file: 03-export-encrypt-staging-secrets.sh
    title: Bestehende Cluster-Secrets mit SOPS verschlüsseln
    description: >-
      Exportiert GHCR- und Cloudflare-Secrets nur temporär und schreibt
      ausschließlich SOPS-verschlüsselte Manifeste ins Repository.
    type: Shellskript
    language: bash
  - file: 04-activate-flux-sops.sh
    title: Flux-SOPS-Git-Zustand vorbereiten
    description: >-
      Prüft Key und verschlüsselte Manifeste und bereitet Decryption sowie
      Secret-Ressourcen im Git-Sollzustand vor.
    type: Shellskript
    language: bash
  - file: 05-bootstrap-live-flux-sops.sh
    title: Live-Flux einmalig für SOPS bootstrappen
    description: >-
      Prüft zuerst den bereits gemergten staging-Sollzustand, aktiviert dann
      einmalig SOPS in der laufenden Flux-Kustomization und wartet auf Ready.
    type: Shellskript
    language: bash
cover_query: server datacenter infrastructure network cloud container cluster kubernetes
cover_provider: pixabay
cover_provider_id: '4605834'
cover_image: /assets/covers/2026-09-18-k3s-proxmox-hardening-part-3.jpg
cover_alt: >-
  proxy, proxy server, free proxy, online proxy, proxy site, proxy list, web
  proxy, web scraping, scraping, data scraping, instagram proxy, sneaker proxy,
  twitter proxy, facebook proxy, supreme bot proxy, residential proxy,
  residential ip, datacenter ip, web crawler, ip rotation, laptop, computer,
  internet, notebook, network, gray data, gray facebook, gray online, gray
  network, gray internet, gray web, gray social, gray media, gray server, proxy,
  proxy, proxy, proxy, proxy
cover_focus: center
cover_credit: by kevinandthepup via Pixabay
cover_credit_url: 'https://pixabay.com/photos/proxy-proxy-server-free-proxy-4605834/'
cover_source_url: 'https://pixabay.com/photos/proxy-proxy-server-free-proxy-4605834/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 98
---
Teil I: Der Blog läuft auf K3s.

Teil II: Der Weg von Git bis Staging läuft automatisch.

Damit war das Setup benutzbar. Aber „läuft“ ist für mich noch nicht dasselbe wie „ich bekomme das in sechs Monaten genauso wieder aufgebaut“.

Genau darum geht es in Teil III.

Bevor ich mit Secrets anfange, die Begriffe, die dafür wichtig sind:

| Begriff | Kurz erklärt |
| --- | --- |
| **Hardening** | Einen funktionierenden Dienst gezielt robuster und schwerer angreifbar machen, zum Beispiel durch feste Versionen, weniger Rechte und reproduzierbare Konfiguration. |
| **Kubernetes Secret** | Eine Kubernetes-Ressource für Zugangsdaten oder Tokens. Sie ist nicht automatisch „sicher verschlüsselt in Git“ – genau dieses Problem löse ich hier mit SOPS. |
| **SOPS** | Ein Werkzeug, das sensible Werte in Dateien wie YAML oder JSON verschlüsselt, während Struktur und Metadaten lesbar bleiben können. |
| **age** | Ein Verschlüsselungswerkzeug mit einem Schlüsselpaar: Der öffentliche Schlüssel verschlüsselt, der private Schlüssel entschlüsselt. |
| **Flux** | Der Dienst aus Teil II, der den gewünschten Zustand aus Git liest und im Kubernetes-Cluster umsetzt. |
| **GitOps** | Der gewünschte technische Zustand liegt in Git. Flux liest diesen Zustand und setzt ihn im Cluster um. |
| **Reconcile** | Der Abgleich zwischen Git und Cluster: Flux prüft, ob beides zusammenpasst, und wendet nötige Änderungen an. |
| **Flux Decryption** | Flux entschlüsselt eine SOPS-Datei erst beim Anwenden im Cluster und übergibt danach das normale Kubernetes-Secret an die API. |
| **Kustomization** | Eine Flux-Ressource, die festlegt, welche Kubernetes-YAML-Dateien angewendet werden und welche Zusatzfunktionen – hier die SOPS-Entschlüsselung – dabei gelten. |
| **Bootstrap** | Die einmalige Startkonfiguration, die nötig ist, bevor der automatische Ablauf alleine funktioniert. Beim SOPS-Setup ist das das erstmalige Hinterlegen des age-Schlüssels und Aktivieren der Entschlüsselung. |
| **Pin / pinnen** | Eine Version oder Datei bewusst auf einen bestimmten Stand festschreiben, statt automatisch einer neuen Version zu folgen. |
| **RBAC** | Das Kubernetes-Berechtigungsmodell nach Rollen. Ich führe in diesem Schritt noch keine eigene RBAC-Härtung ein; das bleibt ein separater Hardening-Punkt. |


## Ziel, Architektur und Stand

Teil III hat ein anderes Ziel als die ersten beiden Teile: **Nicht mehr nur „es läuft“, sondern „ich kann es reproduzieren, absichern und nach einem Ausfall wiederherstellen“.**

![Architektur Teil III: gepinntes K3s, Flux-SOPS, verschlüsselte Secrets sowie Backup- und Monitoring-Pfad](/assets/posts/k3s-proxmox-series/teil-iii-architektur.svg)

Ich teile das absichtlich in einzelne Schritte, damit bei einem Fehler klar bleibt, welche Änderung ihn verursacht hat:

| Schritt | Ziel | Stand |
| --- | --- | --- |
| 1. K3s festschreiben | K3s-Version und Installer reproduzierbar auf einen bekannten Stand setzen | erledigt |
| 2. SOPS/age | Secrets verschlüsselt in Git verwalten | erledigt |
| 3. Flux-Decryption | Secrets erst im Cluster entschlüsseln | erledigt |
| 4. öffentliche Staging-Prüfung | sicherstellen, dass der Umbau nichts kaputt gemacht hat | erledigt |
| 5. Backup/Restore | Rücksicherung wirklich testen | offen |
| 6. Monitoring | Node, Pods und öffentlichen Dienst überwachen | offen |

### To-dos für Teil III

- [ ] vollständigen Restore-Test durchführen und dokumentieren.
- [ ] Backup-Ziel **außerhalb des Clusters** festlegen und bestimmen, wie lange alte Sicherungen aufgehoben werden.
- [ ] privaten age-Key außerhalb des Clusters gesichert hinterlegen und Restore mitprüfen.
- [ ] Monitoring auswählen und zuerst nur die wirklich hilfreichen Messwerte und Zustände anbinden.
- [ ] Warnungen für Node, laufende Anwendungen und den öffentlichen Healthcheck definieren.
- [ ] Upgrade- und Rollback-Ablauf für K3s dokumentieren.
- [ ] Kubernetes-Rollen und Rechte für Secret-Zugriffe gezielt prüfen (RBAC-Härtung).

Ich will bei einem kaputten Node nicht überlegen müssen, welche K3s-Version damals zufällig im `stable`-Channel lag. Ich will Secrets nicht per Hand im Cluster verteilen. Und ein Backup ist für mich erst dann ein Backup, wenn ich weiß, wie ich es wieder einspiele.

Die Reihenfolge bleibt bewusst: erst Reproduzierbarkeit, dann Secrets, danach Restore und Monitoring. Wenn ich Kubernetes-Upgrade, Secret-Umbau und Monitoring gleichzeitig ändere, weiß ich beim ersten Fehler nicht mehr, wo ich anfangen soll zu suchen.

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

Ich wollte drei Dinge festhalten. **SHA-256** ist dabei eine Prüfsumme – also ein Fingerabdruck, mit dem ich erkenne, ob genau die erwartete Datei heruntergeladen wurde. Mit **Upstream-Commit** meine ich den konkreten Commit im offiziellen K3s-Repository.

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

Die Checksumme von `install.sh` sagt natürlich noch nichts über das heruntergeladene K3s-Binary aus. Mit **Binary** meine ich hier einfach die ausführbare K3s-Datei selbst.

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

Zu dem Zeitpunkt war bereits die nächste K3s-Minor-Version verfügbar. Mit **Minor-Version** meine ich hier den Sprung von 1.36 auf 1.37.

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

Wichtig ist aber: **Der Key im Cluster ist nicht mein Backup.** Der öffentliche age-Schlüssel darf in Git liegen. Entscheidend ist der private Schlüssel, denn nur mit ihm kann ich die verschlüsselten Dateien wieder entschlüsseln.

Wenn der Cluster komplett weg ist, brauche ich diesen privaten age-Key deshalb zusätzlich außerhalb des Clusters.

## 6.2 Die vorhandenen Secrets habe ich aus dem laufenden Cluster übernommen

Ich wollte keine neuen GHCR- oder Cloudflare-Zugangsdaten erzeugen, obwohl die vorhandenen bereits funktionieren.

Darum liest das Skript die beiden Secrets direkt aus Kubernetes, legt die Klartextdaten nur in einem temporären Verzeichnis ab und verschlüsselt sie sofort mit SOPS:

[Bestehende Cluster-Secrets mit SOPS verschlüsseln](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/03-export-encrypt-staging-secrets.sh "snippet:bash")

Im Repository landen nur:

```text
infra/kubernetes/staging/secrets/
├── ghcr-pull.sops.yaml
└── cloudflared-token.sops.yaml
```

Name und Namespace dürfen lesbar bleiben. Die eigentlichen Werte unter `data` beziehungsweise `stringData` sind verschlüsselt.

## 6.3 Warum die Reihenfolge beim ersten SOPS-Setup wichtig ist

Hier bin ich beim ersten Rollout tatsächlich in ein Henne-Ei-Problem gelaufen.

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

## 6.4 Der einmalige SOPS-Bootstrap

**Bootstrap** bedeutet hier: einmalig den Anfangszustand herstellen, damit danach alles automatisch über Git laufen kann.

Der interessante Haken kam genau an dieser Stelle.

Der gewünschte SOPS-Zustand lag bereits in `staging`. Die **laufende Flux-Kustomization** – also die Flux-Ressource, die festlegt, welche Manifeste angewendet werden und wie – hatte aber noch keine SOPS-Entschlüsselung aktiviert. Dadurch konnte Flux genau den Commit nicht anwenden, der diese Entschlüsselung erst einschalten sollte.

Bei mir sah das so aus:

```text
Ready=False
Secret/blog-staging/ghcr-pull is SOPS encrypted,
configuring decryption is required for this secret to be reconciled
```

Klassisches Henne-Ei-Problem.

Dafür gibt es jetzt einen einmaligen Bootstrap:

[Live-Flux einmalig für SOPS bootstrappen](/snippets/2026-09-18-k3s-proxmox-hardening-part-3/05-bootstrap-live-flux-sops.sh "snippet:bash")

Das Skript verändert die laufende Flux-Ressource einmalig direkt **erst dann**, wenn es vorher geprüft hat, dass in `origin/staging` bereits alles sauber vorbereitet ist:

- Decryption-Konfiguration
- beide Secret-Ressourcen
- tatsächlich verschlüsselte SOPS-Werte

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

Deshalb läuft bei jedem PR zusätzlich eine **CI-Prüfung**, also ein automatischer GitHub-Actions-Check:

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
Secret-Prüfung in CI         aktiv
Staging nach Migration      erfolgreich geprüft
```

Das ist noch kein „fertig gehärteter Cluster“. Aber zwei Stellen, die mich beim Wiederaufbau ziemlich sicher genervt hätten, sind jetzt sauberer.

Als Nächstes kommt der Punkt, bei dem sich entscheidet, ob das Ganze wirklich belastbar ist:

**Backup und Restore.**

Nicht nur ein Cronjob, der irgendwo Dateien hinlegt, sondern ein Restore, den ich auf einem frischen beziehungsweise bewusst zurückgesetzten Zustand wirklich teste.

Danach kommt Monitoring – also Messwerte, Zustände und Warnungen. Erst wenn ich weiß, dass ich den Cluster wiederherstellen kann, lohnt sich für mich die nächste Runde an Metriken und Alarmen.
