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
- pro Ergebnis nur der beste Chunk eines Artikels
- Dokument-Vektoren als normalisierter Mittelwert der Chunk-Embeddings
- semantische Artikelbeziehungen für das Wissensnetz
- interner Artikel-Graph unter `GET /graph?slug=<slug>&limit=8`
- globaler Artikel-Graph unter `GET /graph/all?limit=4`
- öffentliche, bereinigte Blog-API unter `GET /api/knowledge?limit=4`
- globale Wissensnetz-Seite unter `/knowledge`

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
- gemeinsamen Tags
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

- DuckDB-VSS/HNSW, falls die Artikelmenge groß genug wird
- Neo4j erst für echte Graphbeziehungen und Multi-Hop-Abfragen
- LLM-Antworten mit Quellen
- GraphRAG: semantisches Retrieval plus strukturierte Nachbarschaft gemeinsam in den Prompt geben
- Kafka erst dann, wenn mehrere unabhängige Consumer für Content-Events existieren
