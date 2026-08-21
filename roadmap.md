# Kernel Notes Roadmap

Diese Seite hält geplante größere Erweiterungen für Kernel Notes fest. Sie ist bewusst Teil des Repositories, damit Ideen nicht nur im Chat oder in Issues verschwinden.

## Meilenstein 1 — Vollwertige englische Version des Blogs

**Status:** Geplant  
**Priorität:** Hoch

Kernel Notes soll zusätzlich zur deutschen Ausgabe eine eigenständige, vollwertige englische Version bekommen. Es soll keine einfache Browser- oder Laufzeitübersetzung sein, sondern eine echte zweite Sprachversion mit eigenen, versionierten Markdown-Dateien.

### Zielbild

- Deutsche URLs bleiben unverändert.
- Englische Inhalte werden unter `/en/...` ausgeliefert.
- Ein Sprachumschalter `DE | EN` wechselt direkt zur jeweiligen Übersetzung desselben Artikels.
- UI-Texte werden über eine echte i18n-Lösung wie `i18next` lokalisiert.
- Artikelübersetzungen werden als eigene Markdown-Dateien im Repository gespeichert.
- Deutsche und englische Artikel werden über einen gemeinsamen `translation_key` verbunden.
- Codeblöcke, Snippet-Referenzen, URLs und technische Bezeichner dürfen durch die Übersetzung nicht verändert werden.
- Titel, Excerpt, Überschriften, Alt-Texte, Tags und Kategorien werden ebenfalls übersetzt.
- Archiv, Versionshistorie, Wissensgraph und verwandte Beiträge funktionieren in beiden Sprachen.
- Für Suchmaschinen werden `hreflang`, Canonical-Links und sprachspezifische Metadaten gesetzt.
- Deutsch und Englisch erhalten jeweils einen eigenen RSS-Feed.
- Die Chromium-Smoke-Tests prüfen beide Sprachversionen vollständig.

### Geplante technische Struktur

```text
posts/
├── 2026-08-21-docker-vs-docker-compose.md
└── en/
    └── 2026-08-21-docker-vs-docker-compose.md
```

Beide Dateien gehören fachlich zum selben Artikel:

```yaml
translation_key: docker-vs-docker-compose
language: de
```

```yaml
translation_key: docker-vs-docker-compose
language: en
```

### Übersetzungs-Pipeline

```text
Deutscher Artikel geändert
        ↓
Markdown-aware Übersetzung
        ↓
Englische Markdown-Version erzeugen/aktualisieren
        ↓
Qualitäts- und Strukturprüfung
        ↓
Git / PR
        ↓
Content-Deploy
        ↓
DE + EN Browser-Smoke-Test
```

### Definition of Done

Der Meilenstein gilt als abgeschlossen, wenn:

- [ ] jeder veröffentlichte Artikel eine englische Sprachversion haben kann,
- [ ] der Sprachwechsel ohne Verlust des Artikelkontexts funktioniert,
- [ ] Übersetzungen dauerhaft in Git versioniert werden,
- [ ] Änderungen an deutschen Artikeln eine veraltete englische Version erkennbar machen oder aktualisieren,
- [ ] Snippets und Bilder in beiden Sprachversionen korrekt funktionieren,
- [ ] Archiv und Versionshistorie sprachbewusst arbeiten,
- [ ] der Wissensgraph die jeweilige Sprache korrekt verwendet,
- [ ] `hreflang` und sprachspezifische RSS-Feeds vorhanden sind,
- [ ] die CI beide Sprachversionen mit Chromium durchklickt.

---

Weitere Meilensteine werden hier ergänzt, sobald sie konkret genug sind.
