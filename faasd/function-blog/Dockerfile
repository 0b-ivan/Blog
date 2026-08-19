FROM node:20-alpine AS app
WORKDIR /home/app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./
COPY public ./public

FROM ghcr.io/openfaas/of-watchdog:0.10.9 AS watchdog

FROM node:20-alpine
WORKDIR /home/app

RUN addgroup -S app && adduser -S -G app app

COPY --from=watchdog /fwatchdog /usr/bin/fwatchdog
COPY --from=app /home/app /home/app

ENV PORT=3000
ENV mode=http
ENV upstream_url=http://127.0.0.1:3000
ENV fprocess="node index.js"
ENV cgi_headers=true
ENV write_debug=false

RUN chown -R app:app /home/app
USER app

EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/_/health || exit 1

CMD ["fwatchdog"]
