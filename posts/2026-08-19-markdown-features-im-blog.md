---
id: 2026-08-19-markdown-features-im-blog
version: 1
title: Markdown-Features im Blog nutzen
status: publish
date: 2026-08-19T00:00:00.000Z
created_at: 2026-08-19T00:00:00.000Z
updated_at: 2026-08-19T00:00:00.000Z
author: obivan
reviewed_by: pending
category: Engineering
excerpt: >-
  So nutzt du Tags, Wiki-Links, Footnotes, Admonitions und Mermaid in deinen
  Blogposts.
tags:
  - Markdown
  - Docs
  - Mermaid
search_queries:
  - DevEx
  - query: Architekturdiagramm direkt im Markdown schreiben
    maxRank: 1
  - query: Wie kann ich Warnhinweise in Markdown anzeigen?
    maxRank: 1
cover_query: Markdown Docs Mermaid Engineering
cover_provider: pixabay
cover_provider_id: '2491258'
cover_image: /assets/covers/2026-08-19-markdown-features-im-blog.jpg
cover_alt: >-
  mermaid, siren, sea fantasy, mermaid, mermaid, mermaid, mermaid, mermaid,
  siren, siren
cover_focus: center
cover_score: 87
cover_credit: by AndyFaeth via Pixabay
cover_credit_url: 'https://pixabay.com/photos/mermaid-siren-sea-fantasy-2491258/'
cover_source_url: 'https://pixabay.com/photos/mermaid-siren-sea-fantasy-2491258/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
---

Wenn du Inhalte schnell schreiben willst, ist Markdown genau richtig.

In diesem Post siehst du die wichtigsten Features, die dein Blog jetzt unterstützt.

## 1) Wiki-Links für interne Verweise

Du kannst auf andere Posts mit Wiki-Syntax verlinken:

- [[Zero Downtime Mit Compose]]
- [[Systemd Timer Statt Cron|Systemd statt Cron]]

Das ist praktisch, wenn du beim Schreiben erst mal schnell querverlinken willst.

## 2) Hinweise mit Admonitions

::: note Kontext
Diese Hinweise sind gut für Architektur-Entscheidungen und Trade-offs.
:::

::: tip Praxis
Halte jeden Abschnitt kurz und füge direkt ein lauffähiges Beispiel ein.
:::

::: warning Achtung
Wenn ein Befehl destruktiv ist, immer explizit davor warnen.
:::

## 3) Footnotes für Zusatzinfos

Manche Details stören den Lesefluss im Haupttext und passen besser in eine Fußnote.[^secure-defaults]

[^secure-defaults]: "Secure by default" bedeutet hier: wenig offene Ports, least privilege und nachvollziehbare Deploy-Schritte.

## 4) Mermaid für schnelle Architektur-Skizzen

```mermaid
flowchart LR
  A[Markdown Post] --> B[Parser]
  B --> C[HTML Render]
  C --> D[Blog Seite]
```

## 5) Tags für bessere Navigation

Über Frontmatter `tags` kannst du Beiträge thematisch markieren.

Beispiel:

```yaml
tags: Linux, Security, CI
```

So werden die Tags im Post angezeigt und können auch in der Übersicht als Filter genutzt werden.

## Fazit

Wenn du schnell schreiben und trotzdem strukturiert bleiben willst, sind diese Markdown-Features ein sehr guter Mittelweg zwischen Plain Text und vollem CMS.
