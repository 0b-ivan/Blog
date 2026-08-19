---
id: 2026-08-19-markdown-features-im-blog
version: 1
title: Markdown-Features im Blog nutzen
date: 2026-08-19
created_at: 2026-08-19
updated_at: 2026-08-19
author: obivan
reviewed_by: pending
category: Engineering
excerpt: So nutzt du Tags, Wiki-Links, Footnotes, Admonitions und Mermaid in deinen Blogposts.
tags: Markdown, Docs, Mermaid, DevEx
---

Wenn du Inhalte schnell schreiben willst, ist Markdown genau richtig.

In diesem Post siehst du die wichtigsten Features, die dein Blog jetzt unterstuetzt.

## 1) Wiki-Links fuer interne Verweise

Du kannst auf andere Posts mit Wiki-Syntax verlinken:

- [[Zero Downtime Mit Compose]]
- [[Systemd Timer Statt Cron|Systemd statt Cron]]

Das ist praktisch, wenn du beim Schreiben erst mal schnell querverlinken willst.

## 2) Hinweise mit Admonitions

::: note Kontext
Diese Hinweise sind gut fuer Architektur-Entscheidungen und Trade-offs.
:::

::: tip Praxis
Halte jeden Abschnitt kurz und fuege direkt ein lauffaehiges Beispiel ein.
:::

::: warning Achtung
Wenn ein Befehl destruktiv ist, immer explizit davor warnen.
:::

## 3) Footnotes fuer Zusatzinfos

Manche Details stoeren den Lesefluss im Haupttext und passen besser in eine Fussnote.[^secure-defaults]

[^secure-defaults]: "Secure by default" bedeutet hier: wenig offene Ports, least privilege und nachvollziehbare Deploy-Schritte.

## 4) Mermaid fuer schnelle Architektur-Skizzen

```mermaid
flowchart LR
  A[Markdown Post] --> B[Parser]
  B --> C[HTML Render]
  C --> D[Blog Seite]
```

## 5) Tags fuer bessere Navigation

Ueber Frontmatter `tags` kannst du Beitraege thematisch markieren.

Beispiel:

```yaml
tags: Linux, Security, CI
```

So werden die Tags im Post angezeigt und koennen auch in der Uebersicht als Filter genutzt werden.

## Fazit

Wenn du schnell schreiben und trotzdem strukturiert bleiben willst, sind diese Markdown-Features ein sehr guter Mittelweg zwischen Plain Text und vollem CMS.
