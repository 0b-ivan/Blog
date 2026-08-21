# Article knowledge graph

Every current or archived article renders a local interactive knowledge graph below the article body.

The graph is built from the current article plus up to eight strongly related active posts. Relationships come from shared tags and categories.

Node types:

- current article: orange and largest
- related article: blue
- tag: coral
- category: violet

Node size grows with the number of visible connections. Nodes can be dragged, the canvas can be panned/zoomed, article nodes open posts and tag nodes open the matching tag page.

The graph implementation lives in `assets/knowledge-graph.js` and uses the pinned browser build of `force-graph@1.51.4`. It is lazy-loaded only when the graph approaches the viewport because the project currently has no frontend bundler.

Historical snapshots under `/history/.../vN` intentionally do not render the current knowledge graph, so a historical article version is not mixed with today's relationships.
