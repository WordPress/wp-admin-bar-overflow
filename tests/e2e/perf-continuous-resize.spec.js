/**
 * Item 2 of the A.1 entry checkpoint: continuous-resize CPU on F1.
 *
 * Drives the viewport from 1280 to 700 (and back) in 20-step increments
 * over 2 seconds and asserts:
 *
 *   - cumulative scripting attributable to the plugin's ResizeObserver
 *     callback ≤ 100 ms
 *   - zero long tasks (> 50 ms) recorded since `debug.reset()`
 *
 * Requires `E2E_BASE_URL` pointing at the F1 fixture (Query Monitor +
 * Yoast SEO + Jetpack Newsletter / Scan / Stats + the dedicated counter
 * fixture) AND `E2E_DEBUG=1` so the debug API is exposed.
 */

const { test, expect } = require('@playwright/test');
const { baseUrl, isConfigured, DEBUG_ENABLED, loginToWp } = require('./helpers/wp-session');

test.skip(!isConfigured(), 'E2E_BASE_URL is not set');
test.skip(!DEBUG_ENABLED, 'E2E_DEBUG !== 1; live install is not in debug mode');

test('continuous resize 1280→700 stays within Decision 8 budgets', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginToWp(page);
	await page.goto(`${baseUrl()}/wp-admin/`);

	await page.waitForFunction(() => Boolean(window.omnibarPlugins && window.omnibarPlugins.debug));
	await page.evaluate(() => window.omnibarPlugins.debug.reset());

	const steps = 20;
	const startW = 1280;
	const endW = 700;
	const totalMs = 2000;
	const delay = totalMs / steps;
	for (let i = 1; i <= steps; i++) {
		const w = Math.round(startW - (i / steps) * (startW - endW));
		await page.setViewportSize({ width: w, height: 900 });
		await page.waitForTimeout(delay);
	}
	// Allow trailing observer + raf callbacks to flush.
	await page.waitForTimeout(200);

	const stats = await page.evaluate(() => ({
		resize: window.omnibarPlugins.debug.resizeStats,
		longTasks: window.omnibarPlugins.debug.longTaskCount,
	}));

	console.log('Continuous-resize stats:', stats);
	expect(stats.resize).not.toBeNull();
	expect(stats.resize.total).toBeLessThanOrEqual(100);
	expect(stats.longTasks).toBe(0);
});
