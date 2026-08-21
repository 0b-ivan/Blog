const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.BLOG_BASE_URL || 'http://127.0.0.1:8080';
const baseOrigin = new URL(baseUrl).origin;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (new URL(url).origin === baseOrigin) {
      failures.push(`request failed: ${request.method()} ${url} (${request.failure()?.errorText || 'unknown'})`);
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (new URL(url).origin === baseOrigin && response.status() >= 500) {
      failures.push(`HTTP ${response.status()}: ${url}`);
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#posts-list .post-card').first().waitFor({ state: 'visible' });

    const postHrefs = await page.locator('.post-card[data-href]').evaluateAll((cards) =>
      cards.map((card) => card.dataset.href).filter(Boolean)
    );
    assert.ok(postHrefs.length > 0, 'No post cards found on the start page');

    const topics = await page.locator('#topics-list [data-topic]').evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.topic).filter((topic) => topic && topic !== 'all')
    );

    for (const topic of topics) {
      const selector = `#topics-list [data-topic="${CSS.escape(topic)}"]`;
      await page.locator(selector).click();
      await page.locator('#topics-list [data-topic="all"]').waitFor({ state: 'visible' });
      await page.locator(selector).click();
    }

    for (const href of postHrefs) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#posts-list .post-card').first().waitFor({ state: 'visible' });

      const card = page.locator(`.post-card[data-href="${href}"]`);
      await card.scrollIntoViewIfNeeded();
      await Promise.all([
        page.waitForURL((url) => url.pathname === href),
        card.click()
      ]);

      await page.locator('.post-page h1').waitFor({ state: 'visible' });
      assert.ok((await page.locator('.post-page h1').innerText()).trim().length > 0, `Missing title for ${href}`);

      const imageUrls = await page.locator('.terminal-content img').evaluateAll((images) =>
        images.map((image) => image.getAttribute('src')).filter(Boolean)
      );
      for (const imageUrl of imageUrls) {
        const response = await page.request.get(new URL(imageUrl, baseUrl).toString());
        assert.ok(response.ok(), `Image failed for ${href}: ${imageUrl} (${response.status()})`);
      }

      const snippetCount = await page.locator('.code-snippet__details').count();
      for (let index = 0; index < snippetCount; index += 1) {
        const details = page.locator('.code-snippet__details').nth(index);
        await details.locator('summary').click();
        await details.locator('pre:not([hidden]) code').waitFor({ state: 'visible', timeout: 10_000 });

        const downloadHref = await details.locator('xpath=..').locator('.code-snippet__download').getAttribute('href');
        assert.ok(downloadHref, `Missing snippet download link in ${href}`);
        const response = await page.request.get(new URL(downloadHref, baseUrl).toString());
        assert.ok(response.ok(), `Snippet failed for ${href}: ${downloadHref} (${response.status()})`);
      }
    }

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/snippets/' || url.pathname === '/snippets'),
      page.locator('a[href="/snippets/"]').first().click()
    ]);
    await page.locator('.snippet-library h1').waitFor({ state: 'visible' });
    await page.locator('#snippet-root').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#snippet-root')?.textContent?.trim().length > 0);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/impressum' || url.pathname === '/impressum.html'),
      page.locator('a[href="impressum.html"]').first().click()
    ]);
    await page.locator('.legal-card h1').waitFor({ state: 'visible' });

    assert.deepEqual(failures, [], failures.join('\n'));
    console.log(`Browser smoke test passed: ${postHrefs.length} post(s), ${topics.length} topic filter(s).`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
