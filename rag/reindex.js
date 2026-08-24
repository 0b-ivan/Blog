#!/usr/bin/env node

const endpoint = process.env.RAG_REINDEX_URL || 'http://127.0.0.1:8090/reindex';
const timeoutMs = Number(process.env.RAG_REINDEX_TIMEOUT_MS || 180_000);

async function main() {
  const response = await globalThis.fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal: globalThis.AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`Reindex failed with HTTP ${response.status}: ${payload.slice(0, 500)}`);
  }

  process.stdout.write(`${payload}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
