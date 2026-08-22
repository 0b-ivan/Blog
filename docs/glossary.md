# Glossar

Das Glossar hat genau eine gepflegte Quelle:

```text
config/glossary.json
```

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
/glossary#cidr
```

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

Dieser Block wird nicht von Hand gepflegt. Aenderungen gehoeren immer nach `config/glossary.json`; danach wird erneut synchronisiert.

Pruefen, ob Markdown-Dateien synchron waeren, ohne sie zu veraendern:

```bash
npm run glossary:check
```

Der Blog selbst braucht den Sync nicht, weil er immer die zentrale Glossar-Datei verwendet. Der Sync ist fuer portable bzw. selbstbeschreibende Markdown-Dateien gedacht.

## Markdown ausserhalb von Kernel Notes

Die Syntax `*[VPC]: ...` ist eine Erweiterung von `markdown-it-abbr` und kein Bestandteil von CommonMark/GitHub Flavored Markdown. Renderer mit entsprechender Abbreviation-Unterstuetzung zeigen daraus direkt `<abbr>`-Elemente an.

Renderer ohne diese Erweiterung koennen den verwalteten Definitionsblock weiterhin als Text in der Quelldatei lesen. Der eigentliche Artikelinhalt bleibt normales Markdown und ist nicht von Kernel Notes oder dem Tooltip-JavaScript abhaengig.

## Neue Begriffe pflegen

Bei einem neuen Begriff:

1. Eintrag in `config/glossary.json` ergaenzen.
2. Kurze Erklaerung in `short` halten; sie erscheint im Tooltip.
3. Ausfuehrlichere Erklaerung in `description` pflegen; sie erscheint auf der Glossar-Seite.
4. Schreibvarianten nur dann als `aliases` hinterlegen, wenn sie denselben Begriff meinen.
5. Bei Bedarf `npm run glossary:sync` fuer die betroffenen Markdown-Dateien ausfuehren.

Keine Definitionen direkt in JavaScript oder CSS duplizieren.
