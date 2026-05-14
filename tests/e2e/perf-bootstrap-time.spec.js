/**
 * Item 4 of the A.1 entry checkpoint: F3 no-op idle ≤ 0.5 ms.
 *
 * F3 = bare WP install, plugin activated, NO third-party plugins that
 * register admin-bar nodes. The classifier emits a nav model with no
 * plugin-classified entries; the JS bootstrap's fast-exit path runs.
 *
 * The bootstrap's `wpabo:bootstrap` User-Timing measure captures the IIFE
 * duration. The gate asserts the duration is ≤ 0.5 ms.
 *
 * Configure the test environment via `E2E_BASE_URL_F3` to point at a bare
 * WP install. Skipped when the env var is unset.
 */

const { test, expect } = require('@playwright/test');
const { loginToWp } = require('./helpers/wp-session');

const F3_URL = process.env.E2E_BASE_URL_F3 || '';

test.skip(!F3_URL, 'E2E_BASE_URL_F3 is not set; bare-WP fixture unavailable');

test('bootstrap on F3 finishes within 0.5 ms', async ({ page }) => {
	// Reuse the WP login helper but against the F3 site.
	const saved = process.env.E2E_BASE_URL;
	process.env.E2E_BASE_URL = F3_URL;
	try {
		await loginToWp(page);
		await page.goto(`${F3_URL.replace(/\/$/, '')}/wp-admin/`);
	} finally {
		process.env.E2E_BASE_URL = saved;
	}

	// Read the bootstrap measure.
	const bootstrapDuration = await page.evaluate(() => {
		const entries = performance.getEntriesByName('wpabo:bootstrap');
		return entries.length > 0 ? entries[0].duration : null;
	});

	expect(bootstrapDuration).not.toBeNull();
	console.log(`wpabo:bootstrap on F3 = ${bootstrapDuration.toFixed(3)} ms`);
	expect(bootstrapDuration).toBeLessThanOrEqual(0.5);
});
