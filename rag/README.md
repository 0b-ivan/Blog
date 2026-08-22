# Kernel Grep / Semantic Search

Lokale semantische Suche für Kernel Notes und Basis für späteres GraphRAG.

## Was drin ist

- aktive Artikel aus `posts/*.md`
- Markdown-aware Chunking; Überschriften bleiben als Kontext erhalten und Codeblöcke werden nicht auseinandergerissen
- lokale Embeddings mit `Xenova/multilingual-e5-small`
- DuckDB als lokaler Index
- inkrementeller Index über SHA-256 des Artikels
- CLI-Suche mit Cosine Similarity
- interner HTTP-Suchdienst auf Port `8090`
- Weboberfläche unter `/grep`
- Blog-API unter `/api/search`
- pro Ergebnis nur der beste Chunk eines Artikels

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
  -> POST /api/search
  -> Blog Container
  -> internes Docker-Netz
  -> Kernel Grep Container
  -> DuckDB + lokales Embedding-Modell
```

Der Search-Container wird nicht auf einen Host-Port veröffentlicht. In Produktion liegen DuckDB und Modellcache in persistenten Docker-Volumes. Nach einem Content-Deploy wird der Search-Container neu gestartet; der SHA-256-Abgleich berechnet dabei nur geänderte Artikel neu.

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

- semantische Similarity als zusätzliche Kante im bestehenden Knowledge Graph
- DuckDB-VSS/HNSW, falls die Artikelmenge groß genug wird
- Neo4j für echte Graphbeziehungen und Multi-Hop-Abfragen
- LLM-Antworten mit Quellen
- Kafka erst dann, wenn mehrere unabhängige Consumer für Content-Events existieren
