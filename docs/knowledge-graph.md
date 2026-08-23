# Knowledge graph

Kernel Notes now has two graph views that use the same semantic search foundation.

## Article graph

Every current or archived article renders a local interactive knowledge graph below the article body.

For active articles, neighboring article nodes are selected semantically through Kernel Grep instead of only by shared tags and categories.

The data flow is:

```text
Markdown article
  -> chunks
  -> E5 embeddings
  -> DuckDB vector index
  -> semantic search / article vectors
  -> knowledge graph
```

The RAG service also derives one document vector per article by averaging and normalizing the already stored chunk embeddings. This makes article-to-article similarity available without introducing a second vector store.

The internal RAG endpoint is:

```text
GET /graph?slug=<article-slug>&limit=8
```

It returns relation scores and explanatory metadata, but never raw embeddings.

The browser article graph currently uses `/api/search` to select semantic neighbors because that API is already exposed by the blog container. Shared tags and categories are then added as visible topic nodes so the relation stays understandable to readers. If Kernel Grep is unavailable, the graph falls back to the previous metadata-only selection.

## Global graph

The global knowledge network is available at:

```text
/knowledge
```

It shows all active articles together with recurring tags, categories and semantic article-to-article edges.

The page intentionally reuses the existing hardened fallback shell instead of adding another server-side page renderer. `assets/tag-navigation.js` detects `/knowledge` and lazy-loads `assets/knowledge-network.js`, which replaces the main content area with the global graph.

For semantic enrichment, the page builds a compact query from each article's title, category, tags and excerpt and sends it through the existing `/api/search` proxy. Requests are limited to three concurrent searches so the local E5 model is not hit by all articles at once. Bidirectional results are deduplicated and the stronger similarity score is kept.

Only tags that occur in at least two active articles become global tag nodes. This keeps the graph readable while categories remain fully visible.

The global page also exposes:

- number of active articles
- number of deduplicated semantic edges
- number of topic nodes
- text filtering for nodes
- zoom-to-fit reset
- clickable article, tag and category nodes

## Node types

- article: blue
- tag: coral
- category: violet

On the per-article graph, the currently viewed article remains orange and larger than its neighbors.

Node size grows with the number of visible connections. Nodes can be dragged, the canvas can be panned/zoomed, article nodes open posts and tag nodes open the matching tag page.

Both graph implementations use the pinned local browser build of `force-graph@1.51.4`; no third-party JavaScript is loaded by visitors.

Historical snapshots under `/history/.../vN` intentionally do not render the current article graph, so a historical article version is not mixed with today's relationships.

## Next step: GraphRAG

The next meaningful step is to combine both retrieval modes for answers:

```text
question
  -> semantic chunk retrieval
  -> source articles
  -> graph neighbors / topics
  -> expanded grounded context
  -> LLM answer with citations
```

Neo4j is still not required for this. A graph database becomes useful once Kernel Notes needs explicit typed relationships, multi-hop traversal over persistent entities, or graph queries that cannot be expressed cleanly from the current DuckDB vector index and article metadata.
