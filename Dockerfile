FROM node:26-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* VERSION ./
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev --no-audit --no-fund; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi

# Browser-only dependencies are pinned and installed into the image so visitors
# load them from blog.obivan.org instead of third-party CDNs.
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund \
		force-graph@1.51.4 \
		mermaid@11.17.0 \
		medium-zoom@1.1.0 \
		@highlightjs/cdn-assets@11.11.1 \
	&& npm cache clean --force

ARG BUILD_VERSION
RUN FILE_VERSION="$(tr -d '[:space:]' < VERSION)" && \
		VERSION="${BUILD_VERSION:-$FILE_VERSION}" && \
		RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
		printf '{"version":"%s","release":"%s"}\n' "$VERSION" "$RELEASE_DATE" > /app/build-info.json

FROM gcr.io/distroless/nodejs22-debian13:nonroot

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/build-info.json ./build-info.json
COPY index.html about.html grep.html sources.html impressum.html datenschutz.html script.js ./
COPY styles.css image-viewer.css ./
COPY assets ./assets
COPY config ./config
COPY lib ./lib
COPY server.js enhanced-server.js privacy-server.js ./

# Current article content remains in the image as a bootstrap/fallback.
# Production mounts persistent volumes over these paths.
COPY posts ./posts
COPY snippets ./snippets
COPY archive /content/archive
COPY post-history /content/post-history

ENV ARCHIVE_DIR=/content/archive
ENV POST_HISTORY_DIR=/content/post-history
ENV SEARCH_SERVICE_URL=http://search:8090/search

EXPOSE 8080
CMD ["privacy-server.js"]
