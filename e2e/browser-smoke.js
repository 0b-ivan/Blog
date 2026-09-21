const assert = require('node:assert/strict');
const { URL } = require('node:url');
const { chromium } = require('playwright');

const baseUrl = process.env.BLOG_BASE_URL || 'http://127.0.0.1:8080';
const baseOrigin = new URL(baseUrl).origin;
const allowStatusUnavailable = process.env.BROWSER_SMOKE_ALLOW_STATUS_UNAVAILABLE === 'true';

function isAllowedUnavailableStatus(url, status) {
  if (!allowStatusUnavailable || status !== 503) return false;
  const parsed = new URL(url);
  return parsed.origin === baseOrigin && parsed.pathname === '/api/kubernetes-status';
}

async function clickTopic(page, topic) {
  await page.locator('#topics-list [data-topic]').evaluateAll((buttons, wantedTopic) => {
    const button = buttons.find((candidate) => candidate.dataset.topic === wantedTopic);
    if (!button) {
      throw new Error(`Topic button not found: ${wantedTopic}`);
    }
    button.click();
  }, topic);
}

async function waitForSnippetLibrary(page) {
  const root = page.locator('#snippet-root');
  await root.waitFor({ state: 'visible' });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await root.innerText()).trim().length > 0) {
      return;
    }
    await page.waitForTimeout(100);
  }

  throw new Error('Snippet library did not render any content');
}

async function assertMetaLinksInFooter(page) {
  const metaLinksInMainNav = page.locator([
    '.main-nav a[href="#about"]',
    '.main-nav a[href="/#about"]',
    '.main-nav a[href="index.html#about"]',
    '.main-nav a[href="/about"]',
    '.main-nav a[href="about.html"]',
    '.main-nav a[href="/datenschutz"]',
    '.main-nav a[href="datenschutz.html"]',
    '.main-nav a[href="/impressum"]',
    '.main-nav a[href="impressum.html"]'
  ].join(', '));
  assert.equal(await metaLinksInMainNav.count(), 0, 'Meta links must not appear in the main navigation');

  const footer = page.locator('.site-footer .footer-links');
  await footer.waitFor({ state: 'attached' });
  assert.equal(await footer.locator('a[href="/about"]').count(), 1, 'About must appear once in the footer');
  assert.equal(await footer.locator('a[href="/datenschutz"]').count(), 1, 'Datenschutz must appear once in the footer');
  assert.equal(await footer.locator('a[href="/impressum"]').count(), 1, 'Impressum must appear once in the footer');
}

async function assertKernelGrepTrigger(page) {
  const trigger = page.locator('.main-nav > [data-kernel-grep-trigger]');
  await trigger.waitFor({ state: 'visible' });
  assert.equal(await trigger.locator('svg').count(), 1, 'Kernel Grep trigger must render as a search icon');
  assert.equal(await page.locator('.main-nav a[href="/grep"]').count(), 0, 'Kernel Grep must not be duplicated as a visible navigation link');
  assert.equal(
    await trigger.evaluate((element) => element === element.parentElement?.lastElementChild),
    true,
    'Kernel Grep trigger must be the rightmost navigation item'
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];
  const thirdPartyRequests = new Set();

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('request', (request) => {
    const url = request.url();
    if (!/^https?:/i.test(url)) {
      return;
    }
    if (new URL(url).origin !== baseOrigin) {
      thirdPartyRequests.add(url);
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText || 'unknown';
    if (new URL(url).origin === baseOrigin && failure !== 'net::ERR_ABORTED') {
      failures.push(`request failed: ${request.method()} ${url} (${failure})`);
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (
      new URL(url).origin === baseOrigin
      && response.status() >= 500
      && !isAllowedUnavailableStatus(url, response.status())
    ) {
      failures.push(`HTTP ${response.status()}: ${url}`);
    }
  });

  try {
    const homeResponse = await page.request.get(baseUrl);
    assert.ok(homeResponse.ok(), `Home request failed: ${homeResponse.status()}`);
    assert.match(homeResponse.headers()['content-security-policy'] || '', /default-src 'self'/);
    assert.equal(homeResponse.headers()['referrer-policy'], 'no-referrer');
    assert.match(homeResponse.headers()['permissions-policy'] || '', /camera=\(\)/);
    assert.equal(homeResponse.headers()['x-content-type-options'], 'nosniff');
    assert.equal(homeResponse.headers()['x-frame-options'], 'DENY');

    const packageResponse = await page.request.get(`${baseUrl}/package.json`);
    assert.equal(packageResponse.status(), 404, 'package.json must not be public');
    const serverSourceResponse = await page.request.get(`${baseUrl}/server.js`);
    assert.equal(serverSourceResponse.status(), 404, 'server.js must not be public');
    const ragSourceResponse = await page.request.get(`${baseUrl}/rag/server.js`);
    assert.equal(ragSourceResponse.status(), 404, 'RAG source must not be public');

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#posts-list .post-card').first().waitFor({ state: 'visible' });
    await assertMetaLinksInFooter(page);
    assert.equal(await page.locator('.main-nav a[href="#newsletter"]').count(), 0, 'Abo must not appear in the main navigation');
    assert.equal(await page.locator('#about').count(), 0, 'About content must live on its own page');
    await page.locator('.hero-profile a[href="/about"]').waitFor({ state: 'visible' });
    await assertKernelGrepTrigger(page);

    if (allowStatusUnavailable) {
      const statusResponse = await page.request.get(`${baseUrl}/api/kubernetes-status`);
      assert.equal(statusResponse.status(), 503, 'Local Compose smoke test expects no Kubernetes status backend');
      const homeStatusLabel = page.locator('[data-home-status-label]');
      await homeStatusLabel.waitFor({ state: 'visible' });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await homeStatusLabel.innerText()).trim() === 'Status nicht verfügbar') {
          break;
        }
        await page.waitForTimeout(50);
      }
      assert.equal(
        (await homeStatusLabel.innerText()).trim(),
        'Status nicht verfügbar',
        'Homepage must render the unavailable status fallback when no Kubernetes backend exists'
      );
    }

    const postHrefs = await page.locator('.post-card[data-href]').evaluateAll((cards) =>
      cards.map((card) => card.dataset.href).filter(Boolean)
    );
    assert.ok(postHrefs.length > 0, 'No post cards found on the start page');

    const topics = await page.locator('#topics-list [data-topic]').evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.topic).filter((topic) => topic && topic !== 'all')
    );

    for (const topic of topics) {
      await clickTopic(page, topic);
      await page.locator('#topics-list [data-topic="all"]').waitFor({ state: 'visible' });
      await clickTopic(page, topic);
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

      const pageTitle = page.locator('.post-page > h1');
      await pageTitle.waitFor({ state: 'visible' });
      assert.ok((await pageTitle.innerText()).trim().length > 0, `Missing title for ${href}`);
      const postMeta = await page.locator('.post-page > .meta').innerText();
      assert.doesNotMatch(postMeta, /GMT|Coordinated Universal Time/, `Raw JavaScript date leaked for ${href}`);
      const readingProgress = page.locator('[data-reading-progress]');
      await readingProgress.waitFor({ state: 'attached' });
      assert.equal(
        await readingProgress.evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).position),
        'fixed',
        `Reading progress should be a subtle bottom overlay for ${href}`
      );
      assert.equal(
        await readingProgress.locator('[data-reading-progress-toggle]').count(),
        1,
        `Reading progress toggle missing for ${href}`
      );
      assert.equal(await page.locator('.article-metric[data-tooltip]').count(), 2, `Article metric chips incomplete for ${href}`);
      const engagement = page.locator('.article-engagement');
      await engagement.waitFor({ state: 'attached' });
      assert.equal(await engagement.locator('[data-article-like]').count(), 1, `Like action missing for ${href}`);
      assert.equal(await engagement.locator('[data-article-favorite]').count(), 1, `Favorite action missing for ${href}`);
      assert.equal(await engagement.locator('[data-article-share]').count(), 1, `Share action missing for ${href}`);
      const favoriteButton = engagement.locator('[data-article-favorite]');
      await favoriteButton.click();
      assert.equal(await favoriteButton.getAttribute('aria-pressed'), 'true', `Favorite state did not persist for ${href}`);
      await favoriteButton.click();
      assert.equal(await favoriteButton.getAttribute('aria-pressed'), 'false', `Favorite state did not toggle off for ${href}`);
      await assertMetaLinksInFooter(page);
      await assertKernelGrepTrigger(page);

      const graphSection = page.locator('.knowledge-graph');
      await graphSection.waitFor({ state: 'attached', timeout: 10_000 });
      assert.equal(
        await engagement.evaluate((engagementElement) => {
          const graphElement = engagementElement.parentElement?.querySelector('.knowledge-graph');
          return Boolean(
            graphElement
            && (engagementElement.compareDocumentPosition(graphElement) & 4)
          );
        }),
        true,
        `Engagement must appear before the knowledge graph for ${href}`
      );
      assert.equal(await graphSection.locator('a[href="/knowledge"]').count(), 1, `Global knowledge link missing for ${href}`);
      assert.equal(await graphSection.locator('[data-knowledge-selection]').count(), 1, `Graph selection panel missing for ${href}`);
      await graphSection.scrollIntoViewIfNeeded();
      await graphSection.locator('.knowledge-graph__chrome-title').waitFor({ state: 'visible', timeout: 10_000 });
      assert.match(
        await graphSection.locator('.knowledge-graph__chrome-title').innerText(),
        /^knowledge:\/\/kernel-notes\//,
        `Graph chrome title missing for ${href}`
      );
      assert.equal(await graphSection.locator('.knowledge-graph__chrome-dot').count(), 3, `Graph chrome controls incomplete for ${href}`);
      await graphSection.locator('.knowledge-graph__canvas canvas').waitFor({ state: 'visible', timeout: 15_000 });
      assert.equal(await graphSection.locator('.knowledge-graph__legend span').count(), 4, `Graph legend incomplete for ${href}`);

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

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${postHrefs[0]}`, { waitUntil: 'domcontentloaded' });
    const mobileProgress = page.locator('[data-reading-progress]');
    await mobileProgress.waitFor({ state: 'attached' });
    await page.mouse.wheel(0, 650);
    const compactProgress = page.locator('[data-reading-progress].is-compact');
    await compactProgress.waitFor({ state: 'visible', timeout: 5_000 });
    const compactProgressBox = await compactProgress.boundingBox();
    assert.ok(
      compactProgressBox
      && compactProgressBox.width <= 60
      && compactProgressBox.height <= 60,
      'Reading progress should collapse into a compact circle on mobile'
    );
    await compactProgress.locator('[data-reading-progress-toggle]').click();
    const expandedProgress = page.locator('[data-reading-progress].is-expanded');
    await expandedProgress.waitFor({ state: 'visible', timeout: 5_000 });
    const expandedProgressBox = await expandedProgress.boundingBox();
    assert.ok(
      expandedProgressBox && expandedProgressBox.width >= 240,
      'Tapping the compact reading progress should expand it again'
    );

    const mobileEngagement = page.locator('.article-engagement');
    await mobileEngagement.waitFor({ state: 'visible' });
    await mobileEngagement.scrollIntoViewIfNeeded();
    await page.locator('[data-reading-progress].is-complete').waitFor({ state: 'attached', timeout: 5_000 });
    const mobileGraph = page.locator('.knowledge-graph');
    await mobileGraph.waitFor({ state: 'attached', timeout: 10_000 });
    await mobileGraph.scrollIntoViewIfNeeded();
    await mobileGraph.locator('.knowledge-graph__canvas canvas').waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(
      await mobileGraph.locator('.knowledge-graph__legend').isVisible(),
      false,
      'Compact article graph should hide the legend on mobile'
    );
    const mobileCanvasBox = await mobileGraph.locator('.knowledge-graph__canvas').boundingBox();
    assert.ok(mobileCanvasBox && mobileCanvasBox.height <= 340, 'Compact article graph should stay visually bounded on mobile');
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await assertKernelGrepTrigger(page);
    const grepTrigger = page.locator('.main-nav > [data-kernel-grep-trigger]');
    await grepTrigger.click();
    const grepOverlay = page.locator('.kernel-grep-overlay');
    await grepOverlay.waitFor({ state: 'visible' });
    await grepOverlay.locator('.kernel-grep-console__input').fill('docker compose container');
    await grepOverlay.locator('.kernel-grep-console__status[data-state="success"]').waitFor({ state: 'visible', timeout: 20_000 });
    assert.ok(await grepOverlay.locator('.kernel-grep-console__result').count() > 0, 'Kernel Grep overlay search returned no results');
    await page.keyboard.press('Escape');
    await grepOverlay.waitFor({ state: 'hidden' });

    await page.goto(`${baseUrl}/grep`, { waitUntil: 'domcontentloaded' });
    await page.locator('#grep-title').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#grep-title').innerText()).trim(), 'Kernel Grep');
    await page.locator('#grep-query').fill('docker compose container');
    await page.locator('#grep-status[data-state="success"]').waitFor({ state: 'visible', timeout: 20_000 });
    assert.ok(await page.locator('.grep-result').count() > 0, 'Kernel Grep live search returned no results');
    assert.equal(await page.locator('#grep-clear').isVisible(), true, 'Kernel Grep clear control should be visible after typing');
    const firstGrepHref = await page.locator('.grep-result h2 a').first().getAttribute('href');
    assert.ok(firstGrepHref?.startsWith('/posts/'), 'Kernel Grep result must link to an article');
    await assertMetaLinksInFooter(page);

    const apiSearchResponse = await page.request.get(`${baseUrl}/api/search?q=docker%20compose&limit=2`);
    assert.ok(apiSearchResponse.ok(), `Kernel Grep API failed: ${apiSearchResponse.status()}`);
    const apiSearchPayload = await apiSearchResponse.json();
    assert.ok(Array.isArray(apiSearchPayload.results) && apiSearchPayload.results.length > 0, 'Kernel Grep API returned no results');

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/snippets/' || url.pathname === '/snippets'),
      page.locator('a[href="/snippets/"]').first().click()
    ]);
    await page.locator('.snippet-library h1').waitFor({ state: 'visible' });
    await waitForSnippetLibrary(page);
    await assertMetaLinksInFooter(page);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-footer a[href="/about"]').waitFor({ state: 'visible' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/about'),
      page.locator('.site-footer a[href="/about"]').click()
    ]);
    await page.locator('#about-title').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#about-title').innerText()).trim(), 'About');
    assert.match(await page.locator('.about').innerText(), /Kernel Notes ist mein technisches Notizbuch/);
    await assertMetaLinksInFooter(page);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-footer a[href="/datenschutz"]').waitFor({ state: 'visible' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/datenschutz'),
      page.locator('.site-footer a[href="/datenschutz"]').click()
    ]);
    await page.locator('.legal-card h1').waitFor({ state: 'visible' });
    assert.equal((await page.locator('.legal-card h1').innerText()).trim(), 'Datenschutzhinweise');
    assert.match(await page.locator('.legal-card').innerText(), /kein Werbetracking/i);
    assert.match(await page.locator('.legal-card').innerText(), /Cloudflare/);
    assert.match(await page.locator('.legal-card').innerText(), /Hetzner/);
    assert.match(await page.locator('.legal-card').innerText(), /Kernel Grep/);
    await assertMetaLinksInFooter(page);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-footer a[href="/impressum"]').waitFor({ state: 'visible' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/impressum' || url.pathname === '/impressum.html'),
      page.locator('.site-footer a[href="/impressum"]').click()
    ]);
    await page.locator('.legal-card h1').waitFor({ state: 'visible' });
    await assertMetaLinksInFooter(page);

    assert.deepEqual(failures, [], failures.join('\n'));
    assert.deepEqual(
      [...thirdPartyRequests],
      [],
      `Passive third-party requests detected:\n${[...thirdPartyRequests].join('\n')}`
    );
    console.log(`Browser smoke test passed: ${postHrefs.length} post(s), ${topics.length} topic filter(s), Kernel Grep icon + overlay/live search, standalone About, snippets, footer meta links and zero passive third-party requests.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
