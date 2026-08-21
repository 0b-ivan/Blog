FROM node:26-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* VERSION ./
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev --no-audit --no-fund; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi && npm cache clean --force

ARG BUILD_VERSION
RUN FILE_VERSION="$(tr -d '[:space:]' < VERSION)" && \
		VERSION="${BUILD_VERSION:-$FILE_VERSION}" && \
		RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
		printf '{"version":"%s","release":"%s"}\n' "$VERSION" "$RELEASE_DATE" > /app/build-info.json

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/build-info.json ./build-info.json
COPY index.html impressum.html roadmap.html roadmap.md script.js ./
COPY styles.css image-viewer.css ./
COPY assets ./assets
COPY server.js enhanced-server.js ./

# Current article content remains in the image as a bootstrap/fallback.
# Production mounts persistent volumes over these paths.
COPY posts ./posts
COPY snippets ./snippets
COPY archive /content/archive
COPY post-history /content/post-history

ENV ARCHIVE_DIR=/content/archive
ENV POST_HISTORY_DIR=/content/post-history

EXPOSE 8080
CMD ["enhanced-server.js"]
