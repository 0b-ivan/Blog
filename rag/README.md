# Semantic Search

Erster Baustein für semantische Suche und späteres GraphRAG in Kernel Notes.

## Was aktuell drin ist

- aktive Artikel aus `posts/*.md`
- Markdown-aware Chunking; Überschriften bleiben als Kontext erhalten und Codeblöcke werden nicht auseinandergerissen
- lokale Embeddings mit `Xenova/multilingual-e5-small`
- DuckDB-Datei unter `.data/kernel-notes.duckdb`
- inkrementeller Index über SHA-256 des Artikels
- CLI-Suche mit Cosine Similarity
- pro Ergebnis nur der beste Chunk eines Artikels

Neo4j und Kafka sind bewusst noch nicht Teil dieses Schritts. Erst soll Retrieval auf den vorhandenen Artikeln stabil laufen.

## Installation

```bash
npm install --prefix rag --package-lock=false
```

## Index bauen

```bash
npm run rag:index
```

Beim ersten Lauf lädt Transformers.js das Embedding-Modell von Hugging Face und legt es unter `.data/huggingface` ab. Danach wird der lokale Cache verwendet.

Erneutes Indexieren ist inkrementell:

```text
Artikel unverändert  -> nichts tun
Artikel geändert     -> Chunks neu erzeugen und neu embedden
Artikel gelöscht     -> aus DuckDB entfernen
```

Komplett neu aufbauen:

```bash
npm run rag:index -- --force
```

## Suchen

```bash
npm run rag:search -- "Wie greife ich auf private Systeme ohne SSH zu?"
```

Optional:

```bash
npm run rag:search -- "Docker Deployment" --limit 5
```

## Konfiguration

| Variable | Default |
| --- | --- |
| `RAG_DB_PATH` | `.data/kernel-notes.duckdb` |
| `RAG_MODEL_CACHE` | `.data/huggingface` |
| `RAG_MODEL` | `Xenova/multilingual-e5-small` |
| `RAG_DTYPE` | `q8` |
| `RAG_CHUNK_MAX_CHARS` | `1800` |
| `RAG_LIMIT` | `8` |

Die E5-Prefixe `passage:` für Artikel und `query:` für Suchanfragen werden automatisch gesetzt.

## Noch nicht enthalten

- `/brain` Web-UI
- API-Endpoint für Semantic Search
- DuckDB-VSS/HNSW-Index; bei der aktuellen Artikelmenge reicht Cosine Similarity im Node-Prozess
- Neo4j für echte Graphbeziehungen und Multi-Hop-Abfragen
- LLM-Antworten/RAG-Chat
- Kafka

Der nächste sinnvolle Schritt ist die Search-API plus `/brain`. Danach können semantische Kanten in den bestehenden Knowledge Graph einfließen; Neo4j wird erst interessant, wenn wir daraus echte Graph-Abfragen bauen.
