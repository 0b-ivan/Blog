---
id: 2026-08-23-dwarf-fortress-im-browser
version: 1
title: Dwarf Fortress im Browser – mit Proxmox, Authentik und Cloudflare Zero Trust
status: publish
date: 2026-08-23
created_at: 2026-08-23
updated_at: 2026-08-23
author: obivan
reviewed_by: pending
category: Self-Hosting
excerpt: Dwarf Fortress im Browser, pro Benutzer eine eigene Instanz und trotzdem nur ein gemeinsames Basis-Image – mit Proxmox LXC, KasmVNC, Authentik und Cloudflare Zero Trust.
tags:
  - Dwarf-Fortress
  - Proxmox
  - LXC
  - KasmVNC
  - Authentik
  - Cloudflare
  - Zero-Trust
  - Self-Hosting
---

Dwarf Fortress läuft normalerweise direkt auf dem eigenen Rechner. Ich wollte ausprobieren, ob sich das Spiel stattdessen wie eine kleine selbst gehostete Anwendung betreiben lässt:

```text
Browser
   ↓
Login
   ↓
Dwarf Fortress
```

Dabei soll aber nicht einfach eine gemeinsame Spielinstanz für alle laufen. Jeder Benutzer soll nach dem Login seine **eigene Dwarf-Fortress-Instanz mit eigenen Saves** bekommen.

Die Idee ist inzwischen etwas größer geworden:

```text
Internet
   ↓
Cloudflare Zero Trust
   ↓
Authentik
   ↓
Session Broker
   ↓
Proxmox
   ↓
LXC pro Benutzer
   ↓
KasmVNC
   ↓
Dwarf Fortress
```

## Ausgangslage

Als Basis dient die Linux-Version von **Dwarf Fortress 53.16 Premium**.

Das Spiel selbst läuft auf x86-64 Linux. Für den Zugriff über den Browser wird kein kompletter Desktop benötigt. Stattdessen reicht ein kleiner X11-Stack mit KasmVNC und einem schlanken Window Manager.

Der Browser wird damit praktisch zum Bildschirm der jeweiligen Dwarf-Fortress-Instanz.

```text
Dwarf Fortress
      ↓
     X11
      ↓
   KasmVNC
      ↓
    Browser
```

KasmVNC ist dabei interessanter als ein klassisches VNC + noVNC Setup, weil es direkt für Browserzugriff gebaut ist und die Desktop-Auflösung an die Größe des Clients anpassen kann.

Wird das Browserfenster größer, soll also nicht nur ein 1280x800 Bild hochskaliert werden. Die virtuelle Desktop-Auflösung soll sich wirklich ändern und Dwarf Fortress den zusätzlichen Platz nutzen können.

## Eine Instanz pro Benutzer

Der wichtigste Punkt ist die Trennung der Spielstände.

Nach erfolgreicher Anmeldung bekommt jeder Benutzer einen eigenen LXC:

```text
Ivan
  ↓
CT 3101
  ↓
Dwarf Fortress
  ↓
Saves Ivan

Luca
  ↓
CT 3102
  ↓
Dwarf Fortress
  ↓
Saves Luca
```

Damit muss die Anwendung selbst keine Multi-User-Funktion besitzen.

Dwarf Fortress läuft weiterhin so, als wäre es eine normale Einzelplatzinstallation. Die Trennung übernimmt die Infrastruktur darunter.

## Trotzdem nicht zwanzigmal das gleiche System speichern

Für jede Instanz ein vollständiges Debian inklusive Dwarf Fortress zu kopieren wäre unnötig.

Deshalb soll ein vorbereitetes Proxmox-LXC als Golden Template dienen:

```text
DF Template
│
├── Debian
├── Dwarf Fortress 53.16
├── KasmVNC
├── custom SDL2
└── remote-df services
```

Neue Benutzerinstanzen entstehen daraus als Linked Clone.

Das Basis-Dateisystem wird dadurch gemeinsam genutzt. Erst wenn eine Instanz Daten verändert, werden die geänderten Blöcke separat gespeichert.

Die eigentlichen Saves werden zusätzlich pro Benutzer persistent abgelegt.

```text
Golden Template
      │
      ├── CT Ivan  ── Saves Ivan
      ├── CT Luca  ── Saves Luca
      └── CT User3 ── Saves User3
```

Die Premium-Datei selbst gehört dabei nicht ins Git-Repository. Das Repository enthält nur Installation, Konfiguration und Automatisierung.

## Authentik als Identity Provider

Für die Benutzerverwaltung möchte ich Authentik behalten.

Dort lässt sich beispielsweise eine Gruppe anlegen:

```text
dwarf-fortress-users
├── Ivan
├── Luca
└── weitere Benutzer
```

Nur Mitglieder dieser Gruppe dürfen überhaupt eine Instanz bekommen.

Der Benutzer meldet sich einmal an. Danach erhält der Session Broker eine vertrauenswürdige Identität und kann diese einer Proxmox-Instanz zuordnen.

```text
User Identity
     ↓
Session Broker
     ↓
User → CT Mapping
```

Beim ersten Login existiert noch kein Container. Der Broker klont das Template, legt die benutzerspezifischen Daten an und startet die Instanz.

Bei späteren Logins reicht dann ein Start des vorhandenen Containers.

## Cloudflare Zero Trust davor

Die Anwendung soll nicht direkt über meine öffentliche IP oder offene Ports erreichbar sein.

Deshalb kommt Cloudflare Tunnel davor:

```text
Browser
   ↓
df.example.de
   ↓
Cloudflare Access
   ↓
Cloudflare Tunnel
   ↓
Session Broker
```

`cloudflared` baut die Verbindung von innen nach außen zu Cloudflare auf. Damit muss auf dem Heimnetz beziehungsweise dem Proxmox-Netz kein zusätzlicher eingehender Port für die Anwendung geöffnet werden.

Cloudflare Access übernimmt die erste Zugriffskontrolle.

Authentik wird dabei als OIDC Identity Provider für Cloudflare Access verwendet. Dadurch soll keine doppelte Anmeldung entstehen:

```text
Cloudflare Access
       ↓
    Authentik
       ↓
 erfolgreicher Login
       ↓
 Session Broker
```

Der Broker vertraut dabei nicht einfach einem selbst gesetzten HTTP-Header, sondern prüft das von Cloudflare Access ausgestellte JWT.

## Warum überhaupt noch ein Session Broker?

Cloudflare und Authentik wissen, **wer** der Benutzer ist.

Sie wissen aber nicht, welcher LXC zu diesem Benutzer gehört.

Genau dafür gibt es den Broker:

```text
Authentifizierung
       ↓
Broker
       │
       ├── User bereits bekannt?
       │      ↓
       │   vorhandenen CT starten
       │
       └── neuer User?
              ↓
           Template klonen
              ↓
           CT starten
```

Danach proxyt der Broker die WebSocket-/HTTP-Verbindung zum KasmVNC-Port genau dieser Instanz.

Von außen gibt es trotzdem nur eine Adresse:

```text
https://df.example.de
```

Der Benutzer muss weder die CT-ID noch die interne IP seiner Instanz kennen.

## Instanzen nur starten, wenn sie gebraucht werden

Ein weiterer Vorteil von LXC ist der geringe Overhead.

Trotzdem muss nicht jede Benutzerinstanz rund um die Uhr laufen.

Der Broker kann einen ausgeschalteten Container beim Login automatisch starten:

```text
Login
  ↓
CT stopped
  ↓
Start
  ↓
Healthcheck
  ↓
Spiel öffnen
```

Wenn für eine gewisse Zeit keine Browser-Session mehr vorhanden ist, kann der Container wieder heruntergefahren werden.

Damit können beispielsweise viele Benutzer eingerichtet sein, obwohl gleichzeitig nur wenige Instanzen Ressourcen benötigen.

## Ressourcen begrenzen

Dwarf Fortress kann gerade bei größeren Welten einiges an CPU benötigen.

Deshalb bekommt jede Instanz ein festes Limit, beispielsweise:

```text
4 vCPU
4 GB RAM
```

Das verhindert, dass eine einzelne Festung den gesamten Proxmox-Host beansprucht.

Ob vier vCPUs am Ende wirklich sinnvoll sind, muss sich noch zeigen. Für die eigentliche Simulation ist vor allem schnelle Single-Core-Leistung wichtig.

## Was noch fehlt

Der erste Aufbau besteht deshalb aus mehreren Teilen:

1. Golden LXC Template mit Dwarf Fortress 53.16
2. KasmVNC mit dynamischer Browser-Auflösung
3. persistente Saves pro Benutzer
4. Authentik als OIDC Provider
5. Cloudflare Access + Tunnel
6. Session Broker für Proxmox
7. automatischer Start und Idle-Shutdown
8. Backup der Spielstände

Danach wäre das Ergebnis im Grunde eine kleine private Gaming-Plattform:

```text
Browser öffnen
      ↓
Authentik Login
      ↓
Eigene Festung startet
      ↓
Spielen
```

## Fazit

Eigentlich wollte ich nur Dwarf Fortress im Browser starten.

Aus der Idee wird inzwischen ein interessantes Self-Hosting-Projekt, weil mehrere Dinge zusammenkommen: Proxmox, LXC, Identity Management, Zero Trust, dynamisches Provisioning und Browser-Streaming.

Der entscheidende Punkt ist dabei, Dwarf Fortress selbst möglichst wenig anzufassen.

Das Spiel bleibt eine normale Einzelspieler-Anwendung. Alles, was Multi-User, Authentifizierung, Isolation und Lifecycle betrifft, wird außen herum gebaut.

Wenn das funktioniert, meldet sich ein Benutzer einfach über `df.example.de` an und bekommt seine persönliche Festung im Browser – ohne SSH, ohne VNC-Client und ohne lokal installiertes Dwarf Fortress.