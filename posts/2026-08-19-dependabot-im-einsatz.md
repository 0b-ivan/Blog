---
id: 2026-08-19-dependabot-im-einsatz
version: 4
title: 'Dependabot im Einsatz: Wofür ist er da und wie nutze ich ihn?'
date: 2026-08-19T00:00:00.000Z
published_at: 2026-08-19T16:10:45.000Z
created_at: 2026-08-19T00:00:00.000Z
updated_at: 2026-08-24T00:00:00.000Z
author: obivan
reviewed_by: pending
category: Security
excerpt: >-
  Dependabot hält Abhängigkeiten im Blick, meldet bekannte Schwachstellen und
  kann Update-PRs erzeugen. Ein praktischer Überblick mit GitHub Dependency
  Graph, Alerts und Pull Requests.
tags: 'GitHub, Dependabot, Security, Supply-Chain, DevOps'
search_queries:
  - query: Wie finde ich verwundbare Dependencies in GitHub?
    maxRank: 1
  - query: Wie kann ich Dependency Updates automatisch als Pull Request bekommen?
    maxRank: 1
snippets:
  - file: 01-so-ist-dependabot-in-diesem-blog-konfiguriert.yml
    title: 'Dependabot für Actions, npm und Docker'
    description: Vereinfachtes Beispiel für wöchentliche Dependency-Updates.
    type: Dependabot-Konfiguration
    language: yaml
cover_query: software dependency package update code github vulnerability
cover_provider: pixabay
cover_provider_id: '5290465'
cover_image: /assets/covers/2026-08-19-dependabot-im-einsatz.jpg
cover_alt: >-
  code, javascript, html, programmer, programming, angular, internet, java, css,
  software, digital, hacker, php, function, network, online, program, www,
  intellectually, monitor, cyberspace, github, corona app, app, operating
  system, github, github, github, github, github
cover_focus: center
cover_credit: by viarami via Pixabay
cover_credit_url: 'https://pixabay.com/photos/code-javascript-html-programmer-5290465/'
cover_source_url: 'https://pixabay.com/photos/code-javascript-html-programmer-5290465/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 86
---

Dependencies sind schnell eingebaut und genauso schnell vergessen. Genau hier hilft **Dependabot**: GitHub kennt die Abhängigkeiten eines Repositorys, gleicht sie mit bekannten Schwachstellen ab und kann passende Updates als Pull Request vorschlagen.

Wichtig ist aber: Dependabot ist kein „Merge alles automatisch“-Bot. Ich sehe ihn eher als Kombination aus **Inventar, Frühwarnsystem und Update-Assistent**.

## Die drei Bausteine

### 1) Dependency Graph: Was steckt überhaupt im Projekt?

Der Dependency Graph bildet direkte und transitive Abhängigkeiten aus Manifest- und Lock-Dateien ab. Bei npm sind das zum Beispiel `package.json` und `package-lock.json`.

In meinem Blog-Repository zeigt der [Dependency Graph](#fig-dependency-graph) zum Zeitpunkt dieses Beitrags **288 Dependencies**.

![GitHub Dependency Graph mit direkten und transitiven Abhängigkeiten](/assets/posts/dependabot/03-dependency-graph.svg)

*Dependency Graph: GitHub zeigt direkte und transitive Abhängigkeiten sowie bekannte Findings.*

GitHub unterscheidet dabei unter anderem:

- **Direct**: direkt im Projekt definiert
- **Transitive**: kommt über eine andere Dependency ins Projekt
- **Development**: wird nur im Entwicklungs-/Build-Kontext verwendet

Das ist für die Bewertung wichtig. Eine kritische Schwachstelle in einer Development-Dependency muss ernst genommen werden, hat aber einen anderen Kontext als eine verwundbare Runtime-Dependency, die direkt im produktiven Request-Pfad hängt.

## 2) Dependabot Alerts: Welche Dependencies sind verwundbar?

Dependabot Alerts entstehen, wenn GitHub eine bekannte Schwachstelle für eine Dependency im Dependency Graph erkennt.

In meinem Repository waren zum Zeitpunkt der Screenshots [fünf offene Alerts](#fig-alerts) sichtbar.

![Dependabot Alerts mit Critical, High und Moderate Findings](/assets/posts/dependabot/02-alerts.svg)

*Dependabot Alerts: Severity und Scope helfen bei der ersten Triage.*

Unter anderem waren Findings sichtbar für:

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

Im Repository waren zum Zeitpunkt des Screenshots [vier offene Dependabot-PRs](#fig-pull-requests) vorhanden, unter anderem für `vitest`, `vite`, `esbuild` und `express`.

![Von Dependabot geöffnete Pull Requests](/assets/posts/dependabot/01-pull-requests.svg)

*Dependabot bereitet Updates als normale Pull Requests vor. CI und Review bleiben weiterhin entscheidend.*

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

[So ist Dependabot in diesem Blog konfiguriert](/snippets/2026-08-19-dependabot-im-einsatz/01-so-ist-dependabot-in-diesem-blog-konfiguriert.yml "snippet:yaml")

Damit prüft Dependabot bei mir wöchentlich:

- GitHub Actions
- npm im Blog selbst
- Docker Images im Root-Dockerfile

`weekly` reicht mir hier bewusst aus. Bei einem größeren Projekt oder einem Security-kritischen Stack kann `daily` sinnvoller sein.

## Wo aktiviere ich Dependabot?

Im Repository findest du die [Security-Funktionen](#fig-security-overview) unter **Security and quality** bzw. in den Repository Settings unter den Security-Einstellungen.

![GitHub Security and quality Übersicht](/assets/posts/dependabot/04-security-overview.svg)

*Security and quality: Dependabot ist nur eine Ebene neben Secret Scanning, Code Scanning und Security Advisories.*

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

## Querverweise

- [[wie-dieser-blog-gebaut-ist|Wie dieser Blog gebaut ist]]
- [[rechtschreib-pipeline-trotz-legasthenie|Rechtschreib-Pipeline mit GitHub Actions]]

## Quellen

- [GitHub Docs: Dependabot Alerts](/sources.html#github-dependabot-alerts)
- [GitHub Docs: Dependabot Security Updates](/sources.html#github-dependabot-security-updates)
- [GitHub Docs: dependabot.yml](/sources.html#github-dependabot-yml)
- [GitHub Docs: GitHub Actions](/sources.html#github-actions-docs)
