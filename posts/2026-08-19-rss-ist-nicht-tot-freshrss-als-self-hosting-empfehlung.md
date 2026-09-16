---
id: 2026-08-19-rss-ist-nicht-tot-freshrss-als-self-hosting-empfehlung
version: 2
title: RSS ist nicht tot – FreshRSS als Self-Hosting-Empfehlung
status: publish
date: 2026-08-19
created_at: 2026-08-19
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: Self-Hosting
excerpt: RSS gibt mir die Kontrolle über meine Feeds zurück. Warum ich für ein selbst gehostetes Setup FreshRSS empfehle und Miniflux eine interessante Alternative ist.
tags:
  - RSS
  - FreshRSS
  - Miniflux
  - Self-Hosting
search_queries:
  - query: Wie lese ich Blogartikel und News über RSS statt über einen Algorithmus?
    maxRank: 1
  - query: Wie lese ich Artikel verschiedener Webseiten gesammelt mit RSS und FreshRSS?
    maxRank: 1
snippets:
  - file: "01-docker-macht-das-setup-einfach.yml"
    title: "FreshRSS mit persistenten Daten betreiben"
    description: "Definiert FreshRSS mit Volumes für Daten und Erweiterungen."
    type: "Compose-Beispiel"
    language: "yaml"
---

Fast jede Plattform entscheidet heute mit einem Algorithmus, welche Inhalte wir sehen.

YouTube entscheidet.

Instagram entscheidet.

LinkedIn entscheidet.

Bei RSS funktioniert das anders.

```text
Webseite
   ↓
RSS Feed
   ↓
Mein RSS Reader
   ↓
Ich entscheide, was ich lese
```

Genau deshalb finde ich RSS auch heute noch interessant.

## Was ist RSS überhaupt?

Viele Webseiten, Blogs, Podcasts und Nachrichtenseiten stellen einen RSS- oder Atom-Feed bereit.

Dieser Feed enthält die neuesten Beiträge einer Seite in einem standardisierten Format.

Statt regelmäßig zehn verschiedene Webseiten zu öffnen, abonniert man deren Feeds in einem RSS Reader. Der Reader sammelt anschließend alle neuen Artikel an einer Stelle.

## Self-Hosting statt Cloud-Dienst

Natürlich gibt es zahlreiche gehostete RSS Reader.

Interessanter finde ich aber einen eigenen RSS Server.

Meine Empfehlung dafür ist **FreshRSS**.

FreshRSS ist ein freier, selbst gehosteter RSS- und Atom-Aggregator und passt sehr gut zu einem Docker-Setup.

```text
Internet
   ↓
Reverse Proxy / Cloudflare
   ↓
FreshRSS
   ↓
Docker
   ↓
Eigener Server
```

Damit liegen meine Abonnements und mein Lesestatus auf meiner eigenen Infrastruktur.

## Warum FreshRSS?

FreshRSS bringt bereits sehr viele Funktionen mit, ohne dass das Setup unnötig kompliziert wird.

Dazu gehören unter anderem:

- Kategorien
- Filter
- Suche
- mehrere Benutzer
- Erweiterungen
- Import und Export über OPML
- APIs für externe Reader

Besonders wichtig finde ich den OPML-Export.

Damit ist man nicht dauerhaft an eine bestimmte Software gebunden:

```text
FreshRSS
   ↓
OPML Export
   ↓
anderer RSS Reader
```

Die eigene Feed-Liste bleibt damit portabel.

## Auch mit Apps nutzbar

FreshRSS muss nicht ausschließlich über die Weboberfläche verwendet werden.

Über seine APIs können verschiedene RSS Apps auf denselben Server zugreifen.

```text
                 ┌→ Browser
                 │
FreshRSS Server ─┼→ iPhone
                 │
                 ├→ iPad
                 │
                 └→ Desktop
```

Der große Vorteil dabei: Abonnements und Lesestatus bleiben zentral synchronisiert, während ich auf jedem Gerät den Reader verwenden kann, der mir am besten gefällt.

## Docker macht das Setup einfach

FreshRSS lässt sich problemlos als Container betreiben.

Ein typisches Setup könnte beispielsweise so aussehen:

[FreshRSS mit persistenten Daten betreiben](/snippets/2026-08-19-rss-ist-nicht-tot-freshrss-als-self-hosting-empfehlung/01-docker-macht-das-setup-einfach.yml "snippet:yaml")

Davor kann ein Reverse Proxy oder ein Cloudflare Tunnel liegen.

Gerade in einer bereits bestehenden Docker-Infrastruktur ist FreshRSS damit schnell integriert.

## Alternative: Miniflux

Wer es noch minimalistischer möchte, sollte sich auch **Miniflux** ansehen.

Miniflux verfolgt einen deutlich reduzierteren Ansatz und konzentriert sich stark auf eine einfache Oberfläche und wenige Abhängigkeiten.

Für mich wäre die Entscheidung ungefähr:

```text
Viele Funktionen + Anpassbarkeit
            ↓
         FreshRSS

Minimalistisch + sehr reduziert
            ↓
          Miniflux
```

## Meine Empfehlung

Für ein eigenes Self-Hosting-Setup würde ich mit **FreshRSS** anfangen.

Es lässt sich gut in eine bestehende Docker-Infrastruktur integrieren, ist nicht auf eine bestimmte App beschränkt und die eigene Feed-Liste lässt sich jederzeit wieder exportieren.

Vor allem bekommt man damit etwas zurück, das bei vielen modernen Plattformen verloren gegangen ist:

**Die Kontrolle darüber, welche Inhalte man eigentlich sehen möchte.**
