# Article knowledge graph

Every current or archived article renders a local interactive knowledge graph below the article body.

For active articles, the neighboring article nodes are now selected semantically through Kernel Grep instead of only by shared tags and categories.

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

The browser graph currently uses `/api/search` to select semantic neighbors because that API is already exposed by the blog container. Shared tags and categories are then added as visible topic nodes so the relation stays understandable to readers. If Kernel Grep is unavailable, the graph falls back to the previous metadata-only selection.

Node types:

- current article: orange and largest
- semantically related article: blue
- tag: coral
- category: violet

Blue article nodes are additionally connected to the current article by a semantic edge. The article tooltip shows the vector similarity score.

Node size grows with the number of visible connections. Nodes can be dragged, the canvas can be panned/zoomed, article nodes open posts and tag nodes open the matching tag page.

The graph implementation lives in `assets/knowledge-graph.js` and uses the pinned browser build of `force-graph@1.51.4`. It is lazy-loaded only when the graph approaches the viewport because the project currently has no frontend bundler.

Historical snapshots under `/history/.../vN` intentionally do not render the current knowledge graph, so a historical article version is not mixed with today's relationships.

## Next step

The next useful step is a global `/knowledge` view that loads all article relations from the dedicated graph endpoint. Neo4j is not required for that. A graph database only becomes useful once Kernel Notes needs explicit typed relationships, multi-hop traversal, or GraphRAG queries that cannot be expressed cleanly from the current vector index and article metadata.
