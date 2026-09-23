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

function assertClose(actual, expected, message, tolerance = 0.75) {
  assert.ok(
    Number.isFinite(actual)
    && Number.isFinite(expected)
    && Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual}, expected=${expected})`
  );
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
    assert.match(
      homeResponse.headers()['content-security-policy'] || '',
      /script-src[^;]*'wasm-unsafe-eval'/,
      'CSP must allow WebAssembly compilation for the self-hosted Rive runtime'
    );
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
    const strayHomeBodyText = await page.locator('body').evaluate((body) =>
      [...body.childNodes]
        .filter((node) => node.nodeType === globalThis.Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() || '')
        .filter(Boolean)
    );
    assert.deepEqual(
      strayHomeBodyText,
      [],
      `Home page must not leak literal text nodes around the shell: ${strayHomeBodyText.join(', ')}`
    );
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
    let downloadExportVerified = false;
    let terminalControlsVerified = false;
    let terminalProgressVerified = false;
    let desktopTerminalChromeMetrics = null;

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

      const pageTitle = page.locator('.article-hero .article-title');
      await pageTitle.waitFor({ state: 'visible' });
      assert.ok((await pageTitle.innerText()).trim().length > 0, `Missing title for ${href}`);
      assert.equal(
        await page.locator('.article-hero .article-hero__chrome').count(),
        1,
        `Terminal hero chrome missing for ${href}`
      );
      assert.equal(
        await page.locator('.article-hero .article-hero__prompt').count(),
        1,
        `Terminal hero prompt missing for ${href}`
      );
      const terminal = page.locator('.terminal-post--article');
      assert.equal(await terminal.count(), 1, `Integrated article terminal missing for ${href}`);
      assert.equal(await terminal.locator('.article-hero').count(), 1, `Hero must live inside article terminal for ${href}`);
      assert.equal(await terminal.locator('.article-hero__lights').count(), 0, `Decorative hero lights must be removed for ${href}`);
      assert.equal(await terminal.locator('[data-terminal-action]').count(), 3, `Functional terminal controls incomplete for ${href}`);

      if (!terminalControlsVerified) {
        desktopTerminalChromeMetrics = await terminal.locator('.terminal-chrome').evaluate((chrome) => {
          const view = chrome.ownerDocument.defaultView;
          const chromeRect = chrome.getBoundingClientRect();
          const buttons = [...chrome.querySelectorAll('[data-terminal-action]')];
          const dots = buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            const dot = view.globalThis.getComputedStyle(button, '::before');
            return {
              x: rect.x,
              hitHeight: rect.height,
              width: Number.parseFloat(dot.width),
              height: Number.parseFloat(dot.height)
            };
          });
          return {
            chromeHeight: chromeRect.height,
            paddingLeft: dots.length ? dots[0].x - chromeRect.x : 0,
            dotWidth: dots[0]?.width || 0,
            dotHeight: dots[0]?.height || 0,
            gap: dots.length > 1 ? dots[1].x - dots[0].x - dots[0].width : 0,
            hitHeights: dots.map((dot) => dot.hitHeight)
          };
        });

        assert.ok(
          Math.abs(desktopTerminalChromeMetrics.dotWidth - desktopTerminalChromeMetrics.dotHeight) < 0.5,
          'Visible terminal dots must stay round'
        );
        assert.ok(
          desktopTerminalChromeMetrics.hitHeights.every((height) => height >= desktopTerminalChromeMetrics.dotHeight),
          'Terminal controls must keep an interaction lane at least as tall as the visible dot'
        );

        await terminal.locator('[data-terminal-action="maximize"]').click();
        await page.locator('.terminal-post--article.is-maximized').waitFor({ state: 'attached' });
        await terminal.locator('[data-terminal-action="restore"]').click();
        assert.equal(await terminal.evaluate((element) => element.classList.contains('is-maximized')), false, 'Restore control must leave maximized mode');

        terminalControlsVerified = true;
      }

      const postMeta = await page.locator('.article-hero .article-meta').innerText();
      assert.doesNotMatch(postMeta, /GMT|Coordinated Universal Time/, `Raw JavaScript date leaked for ${href}`);
      const readingProgress = page.locator('[data-reading-progress]');
      await readingProgress.waitFor({ state: 'attached' });
      assert.equal(
        await readingProgress.evaluate((element) => element.ownerDocument.defaultView.globalThis.getComputedStyle(element).position),
        'fixed',
        `Reading progress should be a subtle bottom overlay for ${href}`
      );
      assert.equal(
        await readingProgress.locator('[data-reading-progress-toggle]').count(),
        1,
        `Reading progress toggle missing for ${href}`
      );

      if (!terminalProgressVerified) {
        await page.evaluate(() => {
          const contentElement = globalThis.document.querySelector('.terminal-content');
          if (!contentElement) return;
          const target = globalThis.window.scrollY + contentElement.getBoundingClientRect().top - globalThis.window.innerHeight * 0.55;
          globalThis.window.scrollTo(0, Math.max(160, target));
        });

        await page.waitForFunction(() => {
          const progressElement = globalThis.document.querySelector('[data-reading-progress]');
          const meter = globalThis.document.querySelector('[data-reading-progress-meter]');
          return Boolean(
            progressElement?.classList.contains('is-visible')
            && Number(meter?.getAttribute('aria-valuenow') || 0) > 2
          );
        });

        await terminal.locator('[data-terminal-action="maximize"]').click();
        await page.locator('.terminal-post--article.is-maximized').waitFor({ state: 'attached' });

        await page.waitForFunction(() => {
          const progressElement = globalThis.document.querySelector('[data-reading-progress]');
          const terminalElement = globalThis.document.querySelector('.terminal-post--article.is-maximized');
          if (!progressElement || !terminalElement) return false;
          const progressStyle = globalThis.getComputedStyle(progressElement);
          const terminalStyle = globalThis.getComputedStyle(terminalElement);
          return (
            progressStyle.display !== 'none'
            && progressStyle.visibility !== 'hidden'
            && Number.parseInt(progressStyle.zIndex || '0', 10) > Number.parseInt(terminalStyle.zIndex || '0', 10)
          );
        });

        await terminal.evaluate((element) => {
          const contentElement = element.querySelector('.terminal-content');
          if (!contentElement) return;
          const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
          element.scrollTop = Math.min(maximum, contentElement.offsetTop + 220);
          element.dispatchEvent(new globalThis.Event('scroll'));
        });

        await page.waitForFunction(() => {
          const meter = globalThis.document.querySelector('[data-reading-progress-meter]');
          const value = Number(meter?.getAttribute('aria-valuenow') || 0);
          return value > 2 && value < 100;
        });

        await terminal.locator('[data-terminal-action="restore"]').click();
        await page.waitForFunction(() => {
          const terminalElement = globalThis.document.querySelector('.terminal-post--article');
          const progressElement = globalThis.document.querySelector('[data-reading-progress]');
          return Boolean(
            terminalElement
            && !terminalElement.classList.contains('is-maximized')
            && progressElement?.classList.contains('is-visible')
            && globalThis.getComputedStyle(progressElement).display !== 'none'
            && globalThis.window.scrollY > 0
          );
        });

        assert.ok(
          await page.evaluate(() => globalThis.window.scrollY > 0),
          'Restoring the terminal should preserve the reader position'
        );

        terminalProgressVerified = true;
      }
      assert.equal(await page.locator('.article-metric[data-tooltip]').count(), 2, `Article metric chips incomplete for ${href}`);
      assert.equal(
        await terminal.locator('.article-post-meta').count(),
        0,
        `Metrics and tags must not interrupt the terminal article surface for ${href}`
      );
      assert.equal(
        await page.locator('.terminal-post--article + .article-post-meta').count(),
        1,
        `Article metadata should sit below the terminal for ${href}`
      );
      const engagement = page.locator('.article-engagement');
      await engagement.waitFor({ state: 'attached' });
      assert.equal(await engagement.locator('[data-article-like]').count(), 1, `Like action missing for ${href}`);
      assert.equal(await engagement.locator('.article-download').count(), 1, `Download action missing for ${href}`);
      assert.equal(await engagement.locator('.article-download a[href$=".epub"]').count(), 1, `EPUB download missing for ${href}`);
      assert.equal(await engagement.locator('.article-download a[href$=".pdf"]').count(), 1, `PDF download missing for ${href}`);
      assert.equal(await engagement.locator('[data-article-share]').count(), 1, `Share action missing for ${href}`);

      if (!downloadExportVerified) {
        const epubHref = await engagement.locator('.article-download a[href$=".epub"]').getAttribute('href');
        const epubResponse = await page.request.get(new URL(epubHref, baseUrl).toString());
        assert.equal(epubResponse.status(), 200, `EPUB generation failed for ${href}: HTTP ${epubResponse.status()} ${await epubResponse.text()}`);
        assert.match(epubResponse.headers()['content-type'] || '', /application\/epub\+zip/i);
        const epubBody = await epubResponse.body();
        assert.equal(epubBody.subarray(0, 2).toString('ascii'), 'PK', 'EPUB must be a ZIP package');

        const pdfHref = await engagement.locator('.article-download a[href$=".pdf"]').getAttribute('href');
        const pdfResponse = await page.request.get(new URL(pdfHref, baseUrl).toString());
        assert.equal(pdfResponse.status(), 200, `PDF generation failed for ${href}: HTTP ${pdfResponse.status()} ${await pdfResponse.text()}`);
        assert.match(pdfResponse.headers()['content-type'] || '', /application\/pdf/i);
        const pdfBody = await pdfResponse.body();
        assert.equal(pdfBody.subarray(0, 5).toString('ascii'), '%PDF-', 'PDF must have a valid PDF signature');

        downloadExportVerified = true;
      }

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
      if (desktopTerminalChromeMetrics) {
        const graphChromeMetrics = await graphSection.locator('.knowledge-graph__chrome').evaluate((chrome) => {
          const chromeRect = chrome.getBoundingClientRect();
          const dots = [...chrome.querySelectorAll('.knowledge-graph__chrome-dot')].map((dot) => dot.getBoundingClientRect());
          return {
            chromeHeight: chromeRect.height,
            paddingLeft: dots.length ? dots[0].x - chromeRect.x : 0,
            dotWidth: dots[0]?.width || 0,
            dotHeight: dots[0]?.height || 0,
            gap: dots.length > 1 ? dots[1].x - dots[0].x - dots[0].width : 0
          };
        });

        assertClose(desktopTerminalChromeMetrics.dotWidth, graphChromeMetrics.dotWidth, 'Terminal and knowledge graph dots should share the same size');
        assertClose(desktopTerminalChromeMetrics.dotHeight, graphChromeMetrics.dotHeight, 'Terminal and knowledge graph dots should share the same shape');
        assertClose(desktopTerminalChromeMetrics.gap, graphChromeMetrics.gap, 'Terminal and knowledge graph dots should share the same spacing');
        assertClose(desktopTerminalChromeMetrics.chromeHeight, graphChromeMetrics.chromeHeight, 'Terminal and knowledge graph chrome should share the same height');
        assertClose(desktopTerminalChromeMetrics.paddingLeft, graphChromeMetrics.paddingLeft, 'Terminal and knowledge graph chrome should share the same left inset');

        desktopTerminalChromeMetrics = null;
      }
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

    const downloadSlug = postHrefs[0].split('/').filter(Boolean).pop();
    for (const format of ['epub', 'pdf']) {
      const response = await page.request.get(`${baseUrl}/download/${encodeURIComponent(downloadSlug)}.${format}`);
      assert.equal(
        response.status(),
        200,
        `${format.toUpperCase()} article download failed with HTTP ${response.status()}`
      );

      const contentType = response.headers()['content-type'] || '';
      assert.match(
        contentType,
        format === 'epub' ? /application\/epub\+zip/i : /application\/pdf/i,
        `Unexpected ${format.toUpperCase()} content type: ${contentType}`
      );

      const disposition = response.headers()['content-disposition'] || '';
      assert.match(
        disposition,
        new RegExp(`filename="[^"]+\\.${format}"`, 'i'),
        `Unexpected ${format.toUpperCase()} filename: ${disposition}`
      );

      const body = await response.body();
      if (format === 'epub') {
        assert.equal(body.subarray(0, 2).toString('ascii'), 'PK', 'EPUB download must be a ZIP archive');
      } else {
        assert.equal(body.subarray(0, 5).toString('ascii'), '%PDF-', 'PDF download must start with the PDF signature');
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const mobileHomeHeader = page.locator('.site-header');
    const mobileHomeHero = page.locator('.hero');
    await mobileHomeHeader.waitFor({ state: 'visible' });
    await mobileHomeHero.waitFor({ state: 'visible' });
    const mobileHomeHeaderBox = await mobileHomeHeader.boundingBox();
    const mobileHomeHeroBox = await mobileHomeHero.boundingBox();
    const mobileHeaderRadius = await mobileHomeHeader.evaluate((element) =>
      Number.parseFloat(element.ownerDocument.defaultView.getComputedStyle(element).borderTopLeftRadius)
    );
    assert.ok(mobileHeaderRadius >= 16, 'Mobile header should keep a rounded card shape');
    assert.ok(
      mobileHomeHeaderBox
      && mobileHomeHeroBox
      && mobileHomeHeroBox.y - (mobileHomeHeaderBox.y + mobileHomeHeaderBox.height) <= 48,
      'Mobile home content should visually continue from the header without a large dead gap'
    );

    await page.goto(`${baseUrl}${postHrefs[0]}`, { waitUntil: 'domcontentloaded' });
    const mobilePostHeader = page.locator('.site-header');
    const mobileTerminal = page.locator('.terminal-post--article');
    await mobilePostHeader.waitFor({ state: 'visible' });
    await mobileTerminal.waitFor({ state: 'visible' });
    const mobilePostHeaderBox = await mobilePostHeader.boundingBox();
    const mobileTerminalBox = await mobileTerminal.boundingBox();
    assert.ok(
      mobilePostHeaderBox
      && mobileTerminalBox
      && mobileTerminalBox.y - (mobilePostHeaderBox.y + mobilePostHeaderBox.height) <= 48,
      'Mobile article terminal should connect closely to the header'
    );

    const articleHero = page.locator('.article-hero');
    const terminalContent = page.locator('.terminal-content');
    const articleExcerpt = page.locator('.article-hero__excerpt');
    const heroBox = await articleHero.boundingBox();
    const contentBox = await terminalContent.boundingBox();
    assert.ok(
      heroBox
      && contentBox
      && Math.abs((heroBox.y + heroBox.height) - contentBox.y) <= 1,
      'Article hero and terminal body must meet directly without an inserted seam layer or layout gap'
    );
    assert.equal(
      await page.locator('.article-hero-transition, [data-article-seam]').count(),
      0,
      'Article transition must not use an overlay element that can obscure hero copy'
    );
    if (await articleExcerpt.count()) {
      const excerptOpacity = await articleExcerpt.evaluate((element) =>
        Number.parseFloat(element.ownerDocument.defaultView.getComputedStyle(element).opacity)
      );
      assert.ok(excerptOpacity >= 0.99, 'Article excerpt must remain fully opaque through the hero/body transition');
    }
    const transitionPaint = await page.locator('.terminal-post--article').evaluate((terminal) => {
      const view = terminal.ownerDocument.defaultView;
      const hero = terminal.querySelector('.article-hero');
      const content = terminal.querySelector('.terminal-content');
      return {
        heroBackground: view.getComputedStyle(hero, '::after').backgroundImage,
        contentBackground: view.getComputedStyle(content).backgroundImage
      };
    });
    assert.notEqual(transitionPaint.heroBackground, 'none', 'Hero must blend its own background into the terminal surface');
    assert.notEqual(transitionPaint.contentBackground, 'none', 'Terminal body must continue the background blend after the hero');

    const mobileProgress = page.locator('[data-reading-progress]');
    await mobileProgress.waitFor({ state: 'attached' });
    assert.ok((await page.request.get(`${baseUrl}/vendor/rive/rive.js`)).ok(), 'Self-hosted Rive runtime should be available');
    assert.ok((await page.request.get(`${baseUrl}/vendor/rive/rive.wasm`)).ok(), 'Self-hosted Rive WASM should be available');
    assert.ok((await page.request.get(`${baseUrl}/assets/rive/liquid_download.riv`)).ok(), 'Local Rive liquid asset should be available');
    assert.equal(
      await page.locator('script[data-rive-runtime]').count(),
      0,
      'Rive runtime should not be loaded eagerly on article entry'
    );
    await page.mouse.wheel(0, 650);
    const compactProgress = page.locator('[data-reading-progress].is-compact');
    await compactProgress.waitFor({ state: 'visible', timeout: 5_000 });
    let compactProgressBox = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      compactProgressBox = await compactProgress.boundingBox();
      if (
        compactProgressBox
        && compactProgressBox.width <= 50
        && compactProgressBox.height <= 50
      ) {
        break;
      }
      await page.waitForTimeout(50);
    }
    assert.ok(
      compactProgressBox
      && compactProgressBox.width <= 50
      && compactProgressBox.height <= 50,
      `Reading progress should collapse into a compact bubble on mobile after its size transition (actual=${compactProgressBox ? `${compactProgressBox.width}x${compactProgressBox.height}` : 'missing'})`
    );
    assert.ok(
      compactProgressBox.x + compactProgressBox.width >= 390 - 24,
      'Compact reading progress should default to the bottom-right edge on mobile'
    );
    assert.equal(
      await compactProgress.locator('.reading-progress__bubble-fill').count(),
      1,
      'Compact reading progress should expose an inner bubble fill'
    );
    const fillHeightBefore = await compactProgress.locator('.reading-progress__bubble-fill').evaluate(
      (element) => Number.parseFloat(element.ownerDocument.defaultView.globalThis.getComputedStyle(element).height)
    );
    const hueBefore = await compactProgress.evaluate(
      (element) => Number.parseFloat(element.ownerDocument.defaultView.globalThis.getComputedStyle(element).getPropertyValue('--progress-hue'))
    );
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
    const fillHeightAfter = await compactProgress.locator('.reading-progress__bubble-fill').evaluate(
      (element) => Number.parseFloat(element.ownerDocument.defaultView.globalThis.getComputedStyle(element).height)
    );
    const hueAfter = await compactProgress.evaluate(
      (element) => Number.parseFloat(element.ownerDocument.defaultView.globalThis.getComputedStyle(element).getPropertyValue('--progress-hue'))
    );
    assert.ok(
      fillHeightAfter >= fillHeightBefore,
      'Reading progress bubble fill should rise as the article is read'
    );
    assert.ok(
      hueAfter >= hueBefore,
      'Reading progress bubble should shift from red toward green while reading'
    );

    await page.evaluate(() => {
      const contentNode = globalThis.globalThis.document.querySelector('.terminal-content');
      if (!contentNode) return;
      const rect = contentNode.getBoundingClientRect();
      const absoluteTop = globalThis.scrollY + rect.top;
      const target = absoluteTop + contentNode.scrollHeight * 0.8 - globalThis.innerHeight;
      globalThis.scrollTo(0, Math.max(0, target));
    });
    const riveProgressCanvas = page.locator('[data-reading-progress-rive]');
    let riveState = '';
    for (let attempt = 0; attempt < 150; attempt += 1) {
      riveState = (await riveProgressCanvas.getAttribute('data-rive-state')) || '';
      if (riveState === 'ready' || riveState === 'error') break;
      await page.waitForTimeout(100);
    }
    const riveError = await riveProgressCanvas.getAttribute('data-rive-error');
    assert.equal(
      riveState,
      'ready',
      `Rive should initialize after late reading progress (state=${riveState || 'unset'}, error=${riveError || 'none'})`
    );
    assert.equal(
      await page.locator('script[data-rive-runtime]').count(),
      1,
      'Rive runtime should lazy-load once late reading progress is reached'
    );

    const dragStartBox = await compactProgress.boundingBox();
    assert.ok(dragStartBox, 'Compact reading progress should have a draggable bounding box');
    const dragStartX = dragStartBox.x + dragStartBox.width / 2;
    const dragStartY = dragStartBox.y + dragStartBox.height / 2;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(28, Math.max(80, dragStartY - 90), { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const draggedProgressBox = await compactProgress.boundingBox();
    assert.ok(
      draggedProgressBox && draggedProgressBox.x <= 20,
      'Dragging the compact reading progress across the viewport should snap it to the left edge'
    );
    const storedProgressPosition = await page.evaluate(() => {
      const raw = globalThis.localStorage.getItem('kernel-notes:reading-progress-position');
      return raw ? JSON.parse(raw) : null;
    });
    assert.equal(
      storedProgressPosition?.side,
      'left',
      'Dragged reading progress position should persist in localStorage'
    );

    await compactProgress.locator('[data-reading-progress-toggle]').click();
    const expandedProgress = page.locator('[data-reading-progress].is-expanded');
    await expandedProgress.waitFor({ state: 'visible', timeout: 5_000 });
    let expandedProgressBox = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expandedProgressBox = await expandedProgress.boundingBox();
      if (expandedProgressBox && expandedProgressBox.width >= 240) {
        break;
      }
      await page.waitForTimeout(50);
    }
    assert.ok(
      expandedProgressBox && expandedProgressBox.width >= 240,
      'Tapping the compact reading progress should expand it again after its size transition'
    );

    const mobileEngagement = page.locator('.article-engagement');
    await mobileEngagement.waitFor({ state: 'visible' });
    await mobileEngagement.scrollIntoViewIfNeeded();
    const completionDroplets = page.locator('.reading-progress-burst__droplet');
    const completionDrips = page.locator('.reading-progress-burst__drip');
    const completionParticles = page.locator('.reading-progress-burst__particle');
    await completionDroplets.first().waitFor({ state: 'attached', timeout: 5_000 });
    assert.ok(
      await completionDroplets.count() >= 6,
      'Reading progress completion should release a local liquid splash'
    );
    assert.ok(
      await completionDrips.count() >= 2,
      'Reading progress completion should create downward liquid drips over nearby content'
    );
    assert.ok(
      await completionParticles.count() >= 8,
      'Reading progress completion should restore the multi-emoji burst'
    );
    const completionEmoji = await completionParticles.allTextContents();
    assert.ok(completionEmoji.includes('❓'), 'Completion burst should include a question mark');
    assert.ok(completionEmoji.some((emoji) => emoji.startsWith('👍')), 'Completion burst should include thumbs');
    const completionHue = await mobileProgress.evaluate(
      (element) => Number.parseFloat(element.ownerDocument.defaultView.globalThis.getComputedStyle(element).getPropertyValue('--progress-hue'))
    );
    assert.equal(completionHue, 120, 'Completed reading progress bubble should end green');
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

    const mobileTerminalChrome = await page.locator('.terminal-chrome').evaluate((chrome) => {
      const view = chrome.ownerDocument.defaultView;
      const chromeRect = chrome.getBoundingClientRect();
      const buttons = [...chrome.querySelectorAll('[data-terminal-action]')];
      const dots = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const dot = view.globalThis.getComputedStyle(button, '::before');
        return { x: rect.x, width: Number.parseFloat(dot.width) };
      });
      return {
        chromeHeight: chromeRect.height,
        paddingLeft: dots.length ? dots[0].x - chromeRect.x : 0,
        dotWidth: dots[0]?.width || 0,
        gap: dots.length > 1 ? dots[1].x - dots[0].x - dots[0].width : 0
      };
    });
    const mobileGraphChrome = await mobileGraph.locator('.knowledge-graph__chrome').evaluate((chrome) => {
      const chromeRect = chrome.getBoundingClientRect();
      const dots = [...chrome.querySelectorAll('.knowledge-graph__chrome-dot')].map((dot) => dot.getBoundingClientRect());
      return {
        chromeHeight: chromeRect.height,
        paddingLeft: dots.length ? dots[0].x - chromeRect.x : 0,
        dotWidth: dots[0]?.width || 0,
        gap: dots.length > 1 ? dots[1].x - dots[0].x - dots[0].width : 0
      };
    });
    assertClose(mobileTerminalChrome.dotWidth, mobileGraphChrome.dotWidth, 'Mobile terminal and knowledge graph dots should share the same size');
    assertClose(mobileTerminalChrome.gap, mobileGraphChrome.gap, 'Mobile terminal and knowledge graph dots should share the same spacing');
    assertClose(mobileTerminalChrome.chromeHeight, mobileGraphChrome.chromeHeight, 'Mobile terminal and knowledge graph chrome should share the same height');
    assertClose(mobileTerminalChrome.paddingLeft, mobileGraphChrome.paddingLeft, 'Mobile terminal and knowledge graph chrome should share the same left inset');
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
