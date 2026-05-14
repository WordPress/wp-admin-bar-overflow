/**
 * Item 5 of the A.1 entry checkpoint: single-observer mandate.
 *
 *   - With `WP_ADMIN_BAR_OVERFLOW_DEBUG` defined,
 *     `window.omnibarPlugins.debug.observerCount === 1`.
 *   - Without the constant, `window.omnibarPlugins` (or `.debug`) is
 *     undefined.
 *
 * The first case runs against a live WP install with the constant set
 * (E2E_DEBUG=1). The second case is exercised via a static HTML fixture
 * that inlines the built bundle alongside a nav model carrying
 * `flags.debug = false`, so we don't need a separate live install.
 */

const { test, expect } = require('@playwright/test');
const { baseUrl, isConfigured, DEBUG_ENABLED, loginToWp } = require('./helpers/wp-session');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const BUNDLE_PATH = resolve(__dirname, '../../dist/runtime.js');

test('with WP_ADMIN_BAR_OVERFLOW_DEBUG defined, observerCount === 1', async ({ page }) => {
	test.skip(!isConfigured(), 'E2E_BASE_URL is not set');
	test.skip(!DEBUG_ENABLED, 'E2E_DEBUG !== 1; live install is not in debug mode');

	await loginToWp(page);
	await page.goto(`${baseUrl()}/wp-admin/`);

	await page.waitForFunction(() => Boolean(window.omnibarPlugins && window.omnibarPlugins.debug));

	const count = await page.evaluate(() => window.omnibarPlugins.debug.observerCount);
	expect(count).toBe(1);
});

test('without flags.debug, the debug API is not exposed', async ({ page }, testInfo) => {
	test.skip(!existsSync(BUNDLE_PATH), 'dist/runtime.js missing; run `npm run build` first');

	const fixturePath = resolve(testInfo.outputPath('no-debug.html'));
	const bundle = readFileSync(BUNDLE_PATH, 'utf8');
	const navModel = {
		version: 1,
		enabled: true,
		nodes: [
			{
				nodeId: 'wp-admin-bar-fake-plugin',
				rawId: 'fake-plugin',
				class: 'plugin',
				parent: null,
				priority: 100,
				labels: { canonical: 'Fake Plugin', screen_reader: null },
				icon: { kind: 'none', ref: null },
				badge: { text: null, attention: false },
				href: '#',
				submenuChildren: [],
			},
		],
		dropdown: { id: 'overflow-plugins', label: 'Plugins', emptyMessage: '' },
		breakpoints: { narrowDesktop: 1280, tablet: 782, mobile: 600 },
		flags: { prefersReducedMotion: false, debug: false },
	};

	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>no-debug</title></head><body>
<div id="wpadminbar">
<li id="wp-admin-bar-fake-plugin">fake</li>
</div>
<script type="application/json" id="wp-admin-bar-overflow-data">${JSON.stringify(navModel)}</script>
<script>${bundle}</script>
</body></html>`;
	mkdirSync(resolve(fixturePath, '..'), { recursive: true });
	writeFileSync(fixturePath, html);

	await page.goto(pathToFileURL(fixturePath).toString());
	await page.waitForFunction(() => Boolean(performance.getEntriesByName('wpabo:bootstrap').length));

	const exposed = await page.evaluate(() => {
		if (typeof window.omnibarPlugins === 'undefined') return 'omnibarPlugins-undefined';
		if (typeof window.omnibarPlugins.debug === 'undefined') return 'debug-undefined';
		return 'debug-exposed';
	});
	expect(exposed).not.toBe('debug-exposed');
});
