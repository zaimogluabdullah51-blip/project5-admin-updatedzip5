import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

test('structured-only desktop and mobile search workflows', async () => {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        let body = [];
        if (url.pathname.endsWith('/search-options')) body = {
          ready: true, text_search_ready: false, citation_search_ready: true,
          courts: [{ court: '1. Ceza Dairesi', count: 100 }], min_date: '1962-01-01', max_date: '2026-06-09',
        };
        if (url.pathname.endsWith('/search')) {
          requests.push(url);
          body = { results: [{ id: 'test', court: '1. Ceza Dairesi', esas_no: '2025/123',
            karar_no: '2026/456', karar_tarihi: '2026-01-01', citation_count: 1,
            detected_law_refs: ['5237:TCK:125'] }], has_more: !url.searchParams.has('offset') || url.searchParams.get('offset') === '0' };
        }
        await route.fulfill({ json: body });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/tck.html`);
      await page.locator('#local-index-ready[data-state="ready"]').waitFor();
      assert.equal(await page.locator('#local-mode-text').isVisible(), true);
      assert.equal(await page.locator('#local-mode-text').isDisabled(), true);
      assert.match(await page.locator('#local-mode-text').innerText(), /Henüz kullanılamıyor/);
      await page.locator('#local-mode-browse').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#local-mode-citation').getAttribute('aria-selected'), 'true');
      await page.locator('#local-reference-input').fill('TCK 125');
      await page.locator('#local-court-input').selectOption('1. Ceza Dairesi');
      await page.locator('#local-date-from').fill('2020-01-01');
      await page.locator('#local-reference-form button[type="submit"]').click();
      await page.locator('.local-reference-result').waitFor();
      assert.equal(requests.at(-1).searchParams.get('legalRef'), 'TCK 125');
      assert.equal(requests.at(-1).searchParams.has('query'), false);
      await page.locator('#local-page-next').click();
      await page.waitForFunction(() => document.getElementById('local-page-label').textContent === '21–21');
      assert.equal(requests.at(-1).searchParams.get('offset'), '20');
      await page.locator('#local-mode-browse').click();
      await page.locator('#local-case-number').fill('2025/123');
      await page.locator('#local-reference-form button[type="submit"]').click();
      await page.locator('.local-reference-result').waitFor();
      assert.equal(requests.at(-1).searchParams.get('caseNo'), '2025/123');
      const browserFindPreserved = await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
        return document.dispatchEvent(event);
      });
      assert.equal(browserFindPreserved, true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
      await page.screenshot({ path: `/private/tmp/structured-search-${viewport.width}.png`, fullPage: true });
      await page.evaluate(async () => {
        document.documentElement.lang = 'en';
        await loadLocalSearchOptions();
      });
      assert.match(await page.locator('#local-mode-text').innerText(), /Keyword search\s+Not available yet/);
      assert.equal(await page.locator('#local-mode-text').isDisabled(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'English horizontal overflow');
      await page.screenshot({ path: `/private/tmp/structured-search-en-${viewport.width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
