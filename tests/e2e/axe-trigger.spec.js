/**
 * Item 7 of the A.1 entry checkpoint: axe-core trigger-fixture smoke.
 *
 * The two static HTML files mirror the rendered trigger's closed and open
 * states. Any axe-core violation routes through Decision 8's escalation
 * list OR re-opens the Phase 2 candidate for a runtime ARIA patch
 * (`aria-haspopup` / `aria-controls`).
 */

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const FIXTURES = resolve(__dirname, 'fixtures');

async function audit(page, htmlFile) {
	const url = pathToFileURL(resolve(FIXTURES, htmlFile)).toString();
	await page.goto(url);
	return new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa'])
		.analyze();
}

test('trigger closed state has zero axe violations', async ({ page }) => {
	const results = await audit(page, 'trigger-closed.html');
	expect(results.violations).toEqual([]);
});

test('trigger open state has zero axe violations', async ({ page }) => {
	const results = await audit(page, 'trigger-open.html');
	expect(results.violations).toEqual([]);
});
