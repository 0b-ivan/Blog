# Glossar in Obsidian pflegen

Das zentrale Blog-Glossar kann über denselben LiveSync-Vault wie die Artikel gepflegt werden. Die eigentlichen veröffentlichten Daten bleiben in `config/glossary.json` und `config/glossary/*.json`.

## Aufbau im Vault

Der separate `glossary-publisher` erzeugt beim ersten Start aus den vorhandenen JSON-Dateien einen lokalen, von Git ignorierten Ordner:

```text
posts/_Glossar/
├── _Vorlage.md
├── vpc.md
├── rds.md
├── docker-compose.md
└── ...
```

Da `_Glossar` innerhalb von `posts/` liegt, wird der Ordner von Self-hosted LiveSync nach Obsidian synchronisiert. Der Blog selbst lädt nur Markdown-Dateien direkt aus der ersten Ebene von `posts/`; `_Glossar/*.md` wird daher nicht als Blogartikel veröffentlicht.

## Format eines Begriffs

```md
---
type: glossary
term: "VPC"
section: platform
status: draft
full: "Virtual Private Cloud"
short: "Logisch isoliertes virtuelles Netzwerk in einer Cloud-Umgebung."
aliases: ["AWS VPC"]
---

# VPC

Eine VPC bildet einen eigenen Netzwerkbereich mit Subnetzen, Routing und Sicherheitsregeln.
```

`section` entscheidet, welche zentrale JSON-Datei geändert wird. Erlaubt sind:

```text
base
extended
git-ci
platform
reader
search
security
writing
```

`base` schreibt nach `config/glossary.json`; die übrigen Werte schreiben nach `config/glossary/<section>.json`.

## Veröffentlichen

Solange ein Begriff `status: draft` hat, bleibt er nur im LiveSync-Vault.

Zum Veröffentlichen:

```yaml
status: publish
```

Nach dem Debounce-Fenster erstellt der `glossary-publisher` einen deterministischen Branch und genau einen Pull Request für diesen Begriff, zum Beispiel:

```text
obsidian-glossary/vpc
Glossar: VPC
```

Weitere Änderungen an derselben Obsidian-Datei aktualisieren denselben offenen PR. Erst nach dem Merge wird die zentrale Glossar-JSON auf `main` geändert.

## Neue Begriffe

Für einen neuen Begriff `_Glossar/_Vorlage.md` kopieren, Dateiname und Felder anpassen und zunächst `status: draft` lassen. Nach der inhaltlichen Prüfung `status: publish` setzen.

Die Dateien unter `posts/_Glossar/` sind absichtlich Git-ignored. Sie sind die editierbare LiveSync-Darstellung des zentralen Glossars; veröffentlicht wird weiterhin ausschließlich über Pull Requests in `config/glossary*.json`.
