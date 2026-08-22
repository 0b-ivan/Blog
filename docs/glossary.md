# Glossar

Das Glossar wird zentral im Repository gepflegt. Basisbegriffe liegen in:

```text
config/glossary.json
```

Groessere Themenbereiche sind in kleinere Dateien aufgeteilt:

```text
config/glossary/
├── extended.json
├── git-ci.json
├── platform.json
├── search.json
├── security.json
└── writing.json
```

`lib/glossary.js` laedt alle JSON-Dateien automatisch zusammen. Doppelte Schluessel werden als Fehler behandelt. Damit bleiben Tooltip, Glossar-Seite und Markdown-Sync auf derselben Datenbasis, ohne eine einzelne riesige JSON-Datei pflegen zu muessen.

Dort stehen Fachbegriffe, Abkuerzungen, kurze Erklaerungen und optionale Aliase.

Beispiel:

```json
{
  "VPC": {
    "full": "Virtual Private Cloud",
    "short": "Logisch isoliertes virtuelles Netzwerk in einer Cloud-Umgebung.",
    "description": "Eine VPC bildet einen eigenen Netzwerkbereich mit Subnetzen, Routing und Sicherheitsregeln.",
    "aliases": ["AWS VPC"]
  }
}
```

## Darstellung im Blog

Der Server verwendet `markdown-it-abbr`. Vor dem Rendern werden die zentralen Glossar-Definitionen in den Markdown-Input eingebunden.

Ein normal geschriebener Begriff wie:

```md
Die EC2 liegt in einer VPC.
```

wird dadurch im Blog semantisch als `<abbr>` gerendert. Ohne JavaScript bleibt der native Browser-Hinweis ueber das `title`-Attribut erhalten.

Mit `/assets/glossary.js` bekommt das erste Vorkommen eines Begriffs zusaetzlich einen eigenen Tooltip fuer Hover, Tastatur-Fokus und Touch. Weitere Vorkommen im selben Artikel werden nicht erneut hervorgehoben.

Code-Bloecke und Inline-Code werden von `markdown-it-abbr` nicht als normale Text-Tokens behandelt und deshalb nicht ersetzt.

## Glossar-Seite

Alle gepflegten Eintraege werden automatisch unter:

```text
/glossary
```

alphabetisch ausgegeben. Jeder Begriff hat dort einen stabilen Anker, zum Beispiel:

```text
/glossary#vpc
/glossary#kafka
/glossary#embedding-modell
/glossary#vector-database-cluster
```

## Coverage fuer bestehende Blogposts

Die Tests pruefen representative Fachbegriffe aus allen aktiven Blogposts. Dadurch sind beispielsweise folgende Themen abgesichert:

- Linux/systemd: Cron, Observability, Logging, Daemon, Runbook
- Security: mTLS, Rate Limiting, Break-Glass-Zugang, Fail2ban, UFW
- DevOps: Healthcheck, Reverse Proxy, Cutover, Docker Compose, Port-Mapping
- Git/CI: Dependency Graph, Triage, Secret Scanning, Pull Request
- Writing: Markdown, Admonition, Frontmatter, CSpell, LanguageTool
- Semantic Search: Kafka, Embedding-Modell, Vector-Database-Cluster, Cosine Similarity, GraphRAG

Ein neuer Fachbegriff sollte nicht nur im Text verwendet, sondern gleichzeitig im passenden Glossar-Themenbereich beschrieben werden.

## Definitionen in Markdown-Dateien speichern

Damit eine Markdown-Datei ihre verwendeten Begriffe auch ausserhalb des Blogs mitfuehrt, kann der Sync ausgefuehrt werden:

```bash
npm run glossary:sync
```

Nur eine einzelne Datei:

```bash
npm run glossary:sync -- posts/2026-08-22-mein-artikel.md
```

Der Sync erkennt nur Begriffe, die im Artikel wirklich vorkommen, und schreibt einen verwalteten Block an das Dateiende:

```md
<!-- glossary:start -->
*[CIDR]: Classless Inter-Domain Routing — Schreibweise fuer IP-Adressbereiche wie 10.0.0.0/24.
*[VPC]: Virtual Private Cloud — Logisch isoliertes virtuelles Netzwerk in einer Cloud-Umgebung.
<!-- glossary:end -->
```

Dieser Block wird nicht von Hand gepflegt. Aenderungen gehoeren immer in die zentrale Glossar-Konfiguration; danach wird erneut synchronisiert.

Pruefen, ob Markdown-Dateien synchron waeren, ohne sie zu veraendern:

```bash
npm run glossary:check
```

Der Blog selbst braucht den Sync nicht, weil er beim Rendern immer das zentrale Glossar verwendet. Der Sync ist fuer portable bzw. selbstbeschreibende Markdown-Dateien gedacht.

## Markdown ausserhalb von Kernel Notes

Die Syntax `*[VPC]: ...` ist eine Erweiterung von `markdown-it-abbr` und kein Bestandteil von CommonMark/GitHub Flavored Markdown. Renderer mit entsprechender Abbreviation-Unterstuetzung zeigen daraus direkt `<abbr>`-Elemente an.

Renderer ohne diese Erweiterung koennen den verwalteten Definitionsblock weiterhin als Text in der Quelldatei lesen. Der eigentliche Artikelinhalt bleibt normales Markdown und ist nicht von Kernel Notes oder dem Tooltip-JavaScript abhaengig.

## Neue Begriffe pflegen

Bei einem neuen Begriff:

1. Den passenden Themenbereich unter `config/glossary/` waehlen oder einen Basisbegriff in `config/glossary.json` ergaenzen.
2. Kurze Erklaerung in `short` halten; sie erscheint im Tooltip.
3. Ausfuehrlichere Erklaerung in `description` pflegen; sie erscheint auf der Glossar-Seite.
4. Schreibvarianten nur dann als `aliases` hinterlegen, wenn sie denselben Begriff meinen.
5. Keine zu allgemeinen Aliase verwenden, die in anderem Kontext etwas anderes bedeuten koennen.
6. Bei Bedarf `npm run glossary:sync` fuer die betroffenen Markdown-Dateien ausfuehren.
7. Fuer wichtige neue Fachbegriffe einen Coverage-Test ergaenzen.

Keine Definitionen direkt in JavaScript oder CSS duplizieren.
