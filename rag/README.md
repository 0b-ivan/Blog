# Kernel Grep / Semantic Search

Lokale semantische Suche für Kernel Notes und Basis für GraphRAG.

## Was drin ist

- aktive Artikel aus `posts/*.md`
- Markdown-aware Chunking; Überschriften bleiben als Kontext erhalten und Codeblöcke werden nicht auseinandergerissen
- lokale Embeddings mit `Xenova/multilingual-e5-small`
- DuckDB als lokaler Vector-Index
- inkrementeller Index über SHA-256 des Artikels
- CLI-Suche mit Cosine Similarity
- interner HTTP-Suchdienst auf Port `8090`
- Weboberfläche unter `/grep`
- Blog-API unter `/api/search`
- pro Suchergebnis nur der beste Chunk eines Artikels
- Dokument-Vektoren als normalisierter Mittelwert der Chunk-Embeddings
- semantische Artikelbeziehungen für das Wissensnetz
- interner Artikel-Graph unter `GET /graph?slug=<slug>&limit=8`
- globaler Artikel-Graph unter `GET /graph/all?limit=4`
- öffentliche, bereinigte Blog-API unter `GET /api/knowledge?limit=4`
- globale Wissensnetz-Seite unter `/knowledge`
- GraphRAG-Retrieval mit semantischen Seeds + 1-Hop-Graph-Erweiterung
- zitierbare Kontext-Chunks `K1`, `K2`, … ohne Roh-Embeddings
- CLI für GraphRAG-Kontext über `npm run rag:context`
- interner GraphRAG-Endpunkt `GET /graphrag`

Neo4j und Kafka sind bewusst noch nicht Teil dieses Schritts.

## Lokal per CLI

```bash
npm install --prefix rag --package-lock=false
npm run rag:index
npm run rag:search -- "Wie greife ich auf private Systeme ohne SSH zu?"
```

Beim ersten E5-Lauf lädt Transformers.js das Embedding-Modell und legt es im lokalen Modellcache ab. Danach wird der Cache verwendet.

Erneutes Indexieren ist inkrementell:

```text
Artikel unverändert  -> Embedding behalten
Artikel geändert     -> Chunks neu erzeugen und embedden
Artikel gelöscht     -> aus DuckDB entfernen
```

Komplett neu aufbauen:

```bash
npm run rag:index -- --force
```

Optional mit Limit:

```bash
npm run rag:search -- "Docker Deployment" --limit 5
```

## GraphRAG Context

GraphRAG kombiniert die bestehende semantische Chunk-Suche mit dem Artikel-Wissensnetz.

```text
Frage
  -> Query-Embedding
  -> semantische Seed-Artikel
  -> 1-Hop Artikel-Nachbarn
  -> passende Chunks aus Seeds + Nachbarn
  -> begrenztes Kontextpaket
  -> K1/K2/... Quellen-IDs
```

Direkte Suchtreffer werden immer zuerst im Kontext repräsentiert. Graph-Nachbarn ergänzen den Kontext, dürfen die ursprünglichen Treffer aber nicht verdrängen. Dadurch bleibt das Retrieval auch dann nachvollziehbar, wenn eine semantische Artikelkante zusätzliche Themen einbringt.

CLI:

```bash
npm run rag:context -- "Braucht eine private EC2 eine Public IP?"
```

Mit Tuning:

```bash
npm run rag:context -- \
  "Wie komme ich sicher auf private AWS Systeme?" \
  --seed-limit 3 \
  --neighbors 2 \
  --limit 8 \
  --max-chars 12000
```

Maschinenlesbar:

```bash
npm run rag:context -- "Docker Deployment" --json
```

Der interne HTTP-Endpunkt verwendet dieselbe Pipeline:

```text
GET /graphrag?q=<frage>&seedLimit=3&neighbors=2&limit=8&maxChars=12000
```

Antwort enthält:

- `seeds`: direkte semantische Treffer
- `expandedArticles`: über das Wissensnetz hinzugekommene 1-Hop-Nachbarn
- `context`: ausgewählte Chunks mit `K1`, `K2`, …
- `sources`: deduplizierte Artikelquellen und ihre Citation-IDs
- `promptContext`: bereits formatierter, zitierbarer Kontext für einen späteren LLM-Aufruf
- `contextCharacters`: tatsächlich verwendetes Kontextbudget

Roh-Embeddings verlassen den Search-Service weiterhin nicht.

Die Grenzen sind absichtlich konservativ:

- maximal 6 Seed-Artikel
- maximal 4 Graph-Nachbarn je Seed
- maximal 12 Kontext-Chunks
- maximal 24.000 Zeichen Kontext
- standardmäßig nur 1-Hop, kein rekursives Multi-Hop

Damit lässt sich die Retrieval-Qualität unabhängig von einem konkreten LLM testen.

## Kernel Grep Service

Der Suchdienst läuft getrennt vom Blogprozess:

```text
Browser
  -> /api/search oder /api/knowledge
  -> Blog Container
  -> internes Docker-Netz
  -> Kernel Grep Container
  -> DuckDB + lokales Embedding-Modell
```

Der Search-Container wird nicht auf einen Host-Port veröffentlicht. In Produktion liegen DuckDB und Modellcache in persistenten Docker-Volumes. Nach einem Content-Deploy wird der Search-Container neu gestartet; der SHA-256-Abgleich berechnet dabei nur geänderte Artikel neu.

## Wissensnetz

Das Wissensnetz verwendet dieselbe semantische Basis wie Kernel Grep.

Für jeden Artikel werden die bereits vorhandenen Chunk-Embeddings zu einem normalisierten Dokument-Vektor zusammengefasst. Zwischen diesen Artikel-Vektoren wird Cosine Similarity berechnet. Gemeinsame Tags und Kategorien bleiben als kleine Zusatzsignale erhalten, damit die Verbindung im UI nachvollziehbar bleibt.

Der einzelne Artikel-Graph:

```text
GET /graph?slug=2026-08-22-kernel-grep-semantische-suche-fuer-meinen-blog&limit=8
```

Der globale Graph:

```text
GET /graph/all?limit=4
```

Der Blog proxyt den globalen Graph kontrolliert nach außen:

```text
GET /api/knowledge?limit=4
```

Antworten enthalten unter anderem:

- Artikelmetadaten
- semantische Artikelkanten
- Similarity Score
- Semantic Lift gegenüber der jeweiligen Median-Baseline
- gemeinsame Tags
- gleiche Kategorie ja/nein

Roh-Vektoren werden nie an den Browser ausgegeben.

Die globale Seite `/knowledge` liest diese vorberechneten Artikelbeziehungen direkt aus DuckDB. Dadurch werden beim Öffnen der Seite keine neuen Query-Embeddings erzeugt.

Damit gibt es weiterhin nur eine Wissensbasis:

```text
Markdown
  -> Chunks
  -> E5 Embeddings
  -> DuckDB
     -> Kernel Grep
     -> Artikel-Vektoren
        -> Artikel-Wissensnetz
        -> globales Wissensnetz
        -> GraphRAG 1-Hop Expansion
```

## Konfiguration

| Variable | Default |
| --- | --- |
| `RAG_DB_PATH` | `.data/kernel-notes.duckdb` / im Container `/data/kernel-notes.duckdb` |
| `RAG_MODEL_CACHE` | `.data/huggingface` / im Container `/models` |
| `RAG_POSTS_DIR` | `posts` / im Container `/app/posts` |
| `RAG_MODEL` | `Xenova/multilingual-e5-small` |
| `RAG_DTYPE` | `q8` |
| `RAG_EMBEDDER_MODE` | `e5` |
| `RAG_CHUNK_MAX_CHARS` | `1800` |
| `RAG_LIMIT` | `8` |

Die E5-Prefixe `passage:` für Artikel und `query:` für Suchanfragen werden automatisch gesetzt.

Für CI gibt es zusätzlich `RAG_EMBEDDER_MODE=hash`. Damit wird die komplette DuckDB-/API-/Browser-Kette ohne Modelldownload getestet. Produktion verwendet immer `e5`.

## Noch offen

- den GraphRAG-Endpunkt kontrolliert über den Blog-Container veröffentlichen
- LLM-Antworten ausschließlich aus `promptContext` erzeugen und `K1...Kn` als Quellen erzwingen
- Antwort-UI als echtes „Frag meinen Blog“ statt nur Trefferliste
- Evaluation-Set mit Fragen und erwarteten Quellen für Retrieval-Regressionen
- DuckDB-VSS/HNSW, falls die Artikelmenge groß genug wird
- Neo4j erst für echte persistente Graphbeziehungen und Multi-Hop-Abfragen
- Kafka erst dann, wenn mehrere unabhängige Consumer für Content-Events existieren
