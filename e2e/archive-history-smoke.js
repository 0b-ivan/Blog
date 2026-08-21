const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.BLOG_BASE_URL || 'http://127.0.0.1:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 500) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const firstPost = page.locator('.post-card[data-href]').first();
    await firstPost.waitFor({ state: 'visible' });
    const postHref = await firstPost.getAttribute('data-href');
    assert.ok(postHref, 'No post href found');

    await page.goto(`${baseUrl}${postHref}`, { waitUntil: 'domcontentloaded' });
    const versionBar = page.locator('.post-version-bar');
    await versionBar.waitFor({ state: 'visible' });
    assert.match(await versionBar.innerText(), /Version\s+v\d+/i);

    const historyHref = await versionBar.locator('a[href^="/history/"]').getAttribute('href');
    assert.ok(historyHref, 'Current post does not link to its version history');

    await page.goto(`${baseUrl}${historyHref}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.history-list').waitFor({ state: 'visible' });
    const versions = page.locator('.history-version');
    assert.ok(await versions.count() >= 1, 'Version history is empty');

    const firstVersionHref = await versions.first().locator('a[href*="/v"]').first().getAttribute('href');
    assert.ok(firstVersionHref, 'Version history does not link to a snapshot');

    await page.goto(`${baseUrl}${firstVersionHref}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.terminal-post').waitFor({ state: 'visible' });
    await page.locator('.post-version-bar').waitFor({ state: 'visible' });

    await page.goto(`${baseUrl}/archive`, { waitUntil: 'domcontentloaded' });
    await page.locator('.history-panel h1').waitFor({ state: 'visible' });
    assert.match(await page.locator('.history-panel h1').innerText(), /Archivierte Artikel/i);

    const archiveCards = page.locator('.archive-card');
    if (await archiveCards.count() > 0) {
      await archiveCards.first().click();
      await page.locator('.archive-badge').waitFor({ state: 'visible' });
    }

    assert.deepEqual(failures, [], failures.join('\n'));
    console.log('Archive and article version history smoke test passed.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
