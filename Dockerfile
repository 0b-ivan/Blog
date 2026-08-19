FROM node:26-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev --no-audit --no-fund; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi && npm cache clean --force

ARG BUILD_VERSION
RUN PACKAGE_VERSION="$(node -p "require('./package.json').version")" && \
		VERSION="${BUILD_VERSION:-$PACKAGE_VERSION}" && \
		RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
		printf '{"version":"%s","release":"%s"}\n' "$VERSION" "$RELEASE_DATE" > /app/build-info.json

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/build-info.json ./build-info.json
COPY index.html impressum.html styles.css image-viewer.css script.js ./
COPY assets ./assets
COPY server.js ./
COPY posts ./posts

EXPOSE 8080
CMD ["server.js"]
