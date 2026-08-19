---
id: 2026-08-19-dependabot-im-einsatz
version: 1
title: "Dependabot im Einsatz: Wofür ist er da und wie nutze ich ihn?"
date: 2026-08-19
created_at: 2026-08-19
updated_at: 2026-08-19
author: obivan
reviewed_by: pending
category: Security
excerpt: Dependabot hält Abhängigkeiten im Blick, meldet bekannte Schwachstellen und kann Update-PRs erzeugen. Ein praktischer Überblick mit GitHub Dependency Graph, Alerts und Pull Requests.
tags: GitHub, Dependabot, Security, Supply Chain, DevOps
---

Dependencies sind schnell eingebaut und genauso schnell vergessen. Genau hier hilft **Dependabot**: GitHub kennt die Abhängigkeiten eines Repositorys, gleicht sie mit bekannten Schwachstellen ab und kann passende Updates als Pull Request vorschlagen.

Wichtig ist aber: Dependabot ist kein „Merge alles automatisch“-Bot. Ich sehe ihn eher als Kombination aus **Inventar, Frühwarnsystem und Update-Assistent**.

## Die drei Bausteine

### 1) Dependency Graph: Was steckt überhaupt im Projekt?

Der Dependency Graph bildet direkte und transitive Abhängigkeiten aus Manifest- und Lock-Dateien ab. Bei npm sind das zum Beispiel `package.json` und `package-lock.json`.

In meinem Blog-Repository zeigt der Dependency Graph zum Zeitpunkt dieses Beitrags **288 Dependencies**. GitHub unterscheidet dabei unter anderem:

- **Direct**: direkt im Projekt definiert
- **Transitive**: kommt über eine andere Dependency ins Projekt
- **Development**: wird nur im Entwicklungs-/Build-Kontext verwendet

Das ist für die Bewertung wichtig. Eine kritische Schwachstelle in einer Development-Dependency muss ernst genommen werden, hat aber einen anderen Kontext als eine verwundbare Runtime-Dependency, die direkt im produktiven Request-Pfad hängt.

## 2) Dependabot Alerts: Welche Dependencies sind verwundbar?

Dependabot Alerts entstehen, wenn GitHub eine bekannte Schwachstelle für eine Dependency im Dependency Graph erkennt.

In meinem Repository waren zum Zeitpunkt der Screenshots **fünf offene Alerts** sichtbar, unter anderem für:

- `vitest` mit **Critical**
- `vite` mit **High** und **Moderate**
- `esbuild` mit **Moderate**

GitHub zeigt dabei Severity, Scope und ob die Dependency direkt oder transitiv eingebunden ist.

Für meine Triage schaue ich zuerst auf:

- Severity: Critical/High zuerst
- Runtime oder Development
- direkte oder transitive Dependency
- gibt es bereits eine gefixte Version?
- ist die betroffene Funktion in meinem Setup überhaupt erreichbar?

Ein Alert ist damit nicht automatisch „Produktionssystem kompromittiert“, aber er ist ein konkreter Arbeitsauftrag zur Bewertung.

## 3) Dependabot Pull Requests: Updates automatisiert vorbereiten

Neben Alerts kann Dependabot Pull Requests für Dependency-Updates öffnen.

Im Repository waren zum Zeitpunkt des Screenshots vier offene Dependabot-PRs vorhanden, unter anderem für `vitest`, `vite`, `esbuild` und `express`.

Dabei gibt es zwei wichtige Fälle:

- **Security Updates** aktualisieren eine bekannte verwundbare Dependency auf eine sichere Version.
- **Version Updates** halten Dependencies generell aktuell, auch wenn aktuell keine bekannte Schwachstelle vorliegt.

Der Pull Request ist für mich aber nur der Startpunkt. Ein neuer Dependency-Stand bedeutet noch lange nicht, dass das Update sicher gemerged werden kann.

Gerade Major-Updates können APIs, Build-Verhalten oder Laufzeitversionen ändern. Deshalb gilt bei mir:

1. PR-Inhalt und Versionssprung prüfen
2. Release Notes bei größeren Sprüngen lesen
3. CI vollständig durchlaufen lassen
4. erst bei grünen Tests mergen

Ein rotes `X` am Dependabot-PR ist genau das Signal, **nicht blind zu mergen**.

## So ist Dependabot in diesem Blog konfiguriert

Die Konfiguration liegt unter `.github/dependabot.yml`.

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "npm"
    directory: "/faasd/function-blog"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "docker"
    directory: "/faasd/function-blog"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

Damit prüft Dependabot bei mir wöchentlich:

- GitHub Actions
- npm im Blog selbst
- npm in der faasd Function
- Docker Images im Root-Dockerfile
- Docker Images in der faasd Function

`weekly` reicht mir hier bewusst aus. Bei einem größeren Projekt oder einem Security-kritischen Stack kann `daily` sinnvoller sein.

## Wo aktiviere ich Dependabot?

Im Repository findest du die Security-Funktionen unter **Security and quality** bzw. in den Repository Settings unter den Security-Einstellungen.

In meinem Repository sind unter anderem **Dependabot Alerts**, **Security Advisories**, **Private Vulnerability Reporting** und **Secret Scanning Alerts** aktiviert. Code Scanning ist davon getrennt und muss separat eingerichtet werden.

Für Dependabot sind vor allem relevant:

- Dependency Graph
- Dependabot Alerts
- Dependabot Security Updates
- Dependabot Version Updates über `.github/dependabot.yml`

Dependabot ersetzt also **kein Code Scanning und kein Secret Scanning**.

## Mein praktischer Workflow

Wenn Dependabot einen Alert oder PR erzeugt, arbeite ich ungefähr so:

```text
Dependency erkannt
        ↓
Dependabot Alert / Update-PR
        ↓
Severity + Scope prüfen
        ↓
Versionssprung bewerten
        ↓
CI / Tests / Build
        ↓
Merge oder bewusst zurückstellen
```

Bei vielen PRs kann man Dependabot zusätzlich mit Gruppen, Zeitplänen, Labels oder Ignore-Regeln entschärfen. Ziel sollte aber nicht sein, Warnungen möglichst schnell wegzuklicken, sondern Dependency-Updates zu einem normalen Teil des Entwicklungsprozesses zu machen.

## Was Dependabot nicht kann

Dependabot deckt die **Supply-Chain-Seite der Dependencies** ab. Er findet nicht automatisch jede Schwachstelle im eigenen Anwendungscode und ersetzt auch keine Laufzeit- oder Container-Scans.

Für ein brauchbares Gesamtbild kombiniere ich deshalb mehrere Ebenen:

- Dependabot für Dependencies
- CI-Tests für Regressionen
- Trivy für Container/Images
- Secret Scanning für versehentlich eingecheckte Secrets
- Code Scanning für Schwachstellen und Fehler im eigenen Code

## Fazit

Dependabot ist vor allem dann nützlich, wenn man ihn nicht als nervigen PR-Generator betrachtet.

Der eigentliche Mehrwert ist die Kette aus **Dependency Graph → Alert → Update-PR → CI → kontrollierter Merge**.

Damit werden veraltete und verwundbare Dependencies sichtbar, bevor sie irgendwann zufällig bei einem Incident oder manuellen Audit auffallen.

### Weiterführend

- [GitHub Docs: Dependabot Alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts)
- [GitHub Docs: Dependabot Security Updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)
- [GitHub Docs: dependabot.yml](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file)
- [GitHub Docs: Dependabot Optionen](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
