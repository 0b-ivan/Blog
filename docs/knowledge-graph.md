# Knowledge graph

Kernel Notes now has two graph views that use the same semantic vector foundation.

## Article graph

Every current or archived article renders a local interactive knowledge graph below the article body.

For active articles, neighboring article nodes are selected semantically through Kernel Grep instead of only by shared tags and categories.

The data flow is:

```text
Markdown article
  -> chunks
  -> E5 embeddings
  -> DuckDB vector index
  -> article vectors
  -> knowledge graph
```

The RAG service derives one document vector per article by averaging and normalizing the already stored chunk embeddings. This makes article-to-article similarity available without introducing a second vector store.

The internal per-article endpoint is:

```text
GET /graph?slug=<article-slug>&limit=8
```

It returns relation scores and explanatory metadata, but never raw embeddings.

The browser article graph can still fall back to the existing `/api/search` path for semantic neighbors, while shared tags and categories remain visible topic nodes.

## Global graph

The global knowledge network is available at:

```text
/knowledge
```

It shows all active articles together with recurring tags, categories and semantic article-to-article edges.

The global relation set is calculated directly from the already indexed article vectors:

```text
GET /graph/all?limit=4
```

The search container remains internal. The blog container exposes only the sanitized graph payload:

```text
GET /api/knowledge?limit=4
```

No raw embedding vector leaves the RAG service. The browser receives article metadata and explainable edges containing similarity, semantic lift, shared tags and whether both articles use the same category.

The page intentionally reuses the existing hardened fallback shell instead of adding another server-side HTML renderer. `assets/tag-navigation.js` detects `/knowledge` and lazy-loads `assets/knowledge-network.js`, which replaces the main content area with the global graph.

Because `/knowledge` reads existing article vectors, opening the page does not trigger new E5 inference.

Only tags that occur in at least two active articles become global tag nodes. This keeps the graph readable while categories remain fully visible.

The global page exposes:

- number of active articles
- number of deduplicated semantic edges
- number of topic nodes
- text filtering for nodes
- zoom-to-fit reset
- clickable article, tag and category nodes
- edge tooltips with semantic similarity and metadata explanations

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
