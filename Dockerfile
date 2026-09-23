FROM node:26-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* VERSION RELEASE_NAME ./
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev --no-audit --no-fund; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi

# Browser-only dependencies are pinned and installed into the image so visitors
# load them from blog.obivan.org instead of third-party CDNs. EPUB export
# dependencies remain local to the blog image; PDF rendering runs in the
# dedicated LuaLaTeX service.
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund \
		force-graph@1.51.4 \
		mermaid@11.17.0 \
		medium-zoom@1.1.0 \
		@rive-app/canvas@2.42.2 \
		@highlightjs/cdn-assets@11.11.1 \
		epub-gen-memory@1.1.2 \
		jszip@3.10.2 \
	&& npm cache clean --force

ARG BUILD_VERSION
RUN FILE_VERSION="$(tr -d '[:space:]' < VERSION)" && \
		VERSION="${BUILD_VERSION:-$FILE_VERSION}" && \
		RELEASE_NAME="$(tr -d '\r\n' < RELEASE_NAME)" && \
		RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
		printf '{"version":"%s","name":"%s","release":"%s"}\n' "$VERSION" "$RELEASE_NAME" "$RELEASE_DATE" > /app/build-info.json

FROM gcr.io/distroless/nodejs22-debian13:nonroot

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/build-info.json ./build-info.json
COPY index.html about.html grep.html sources.html status.html analytics.html impressum.html datenschutz.html script.js ./
COPY styles.css image-viewer.css ./
COPY assets ./assets
COPY config ./config
COPY lib ./lib
COPY server.js enhanced-server.js privacy-server.js seo-server.js staging-server.js analytics-server.js ./

# Current article content remains in the image as a bootstrap/fallback.
# Production mounts persistent volumes over these paths.
COPY posts ./posts
COPY snippets ./snippets
COPY archive /content/archive
COPY post-history /content/post-history

ENV ARCHIVE_DIR=/content/archive
ENV POST_HISTORY_DIR=/content/post-history
ENV SEARCH_SERVICE_URL=http://search:8090/search
ENV PDF_SERVICE_URL=http://pdf:8092

EXPOSE 8080
CMD ["seo-server.js"]
