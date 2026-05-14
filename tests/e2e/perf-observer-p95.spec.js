/**
 * Item 3 of the A.1 entry checkpoint: MutationObserver callback p95 ≤ 4 ms
 * on F1 in steady state.
 *
 * Loads the admin page with `WP_ADMIN_BAR_OVERFLOW_DEBUG` defined,
 * triggers a series of admin-bar mutations (focus changes, attribute
 * flips on plugin nodes), waits for the rolling sample buffer to fill,
 * then reads `window.omnibarPlugins.debug.observerStats.p95`.
 */

const { test, expect } = require('@playwright/test');
const { baseUrl, isConfigured, DEBUG_ENABLED, loginToWp } = require('./helpers/wp-session');

test.skip(!isConfigured(), 'E2E_BASE_URL is not set');
test.skip(!DEBUG_ENABLED, 'E2E_DEBUG !== 1; live install is not in debug mode');

test('MutationObserver callback p95 stays within 4 ms', async ({ page }) => {
	await loginToWp(page);
	await page.goto(`${baseUrl()}/wp-admin/`);

	await page.waitForFunction(() => Boolean(window.omnibarPlugins && window.omnibarPlugins.debug));

	// Generate observer callbacks by toggling attributes on the plugin nodes
	// the runtime is watching. Mirrors the steady-state load of plugins that
	// periodically refresh counters or aria states.
	const observed = await page.evaluate(async () => {
		const ids = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-classified-plugin-node')).map((el) => el.id);
		if (ids.length === 0) return { warned: 'no-plugin-nodes-detected' };
		window.omnibarPlugins.debug.reset();
		for (let i = 0; i < 50; i++) {
			for (const id of ids) {
				const el = document.getElementById(id);
				if (!el) continue;
				el.setAttribute('data-tick', String(i));
			}
			await new Promise((r) => setTimeout(r, 16));
		}
		return window.omnibarPlugins.debug.observerStats;
	});

	if (observed && observed.warned) {
		test.skip(true, observed.warned);
	}

	console.log('MutationObserver stats:', observed);
	expect(observed).not.toBeNull();
	expect(observed.count).toBeGreaterThan(0);
	expect(observed.p95).toBeLessThanOrEqual(4);
});
