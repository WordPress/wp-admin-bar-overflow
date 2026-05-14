/**
 * S1.10 — axe-core scan on the live admin bar across the four viewport
 * bands. Scoped to `#wp-admin-bar-overflow-plugins` so we audit our own
 * surface; pre-existing Core admin-bar a11y gaps are out of scope here
 * (they route through the Phase 2 ARIA-patch candidate per the plan).
 */

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { baseUrl, isConfigured, loginToWp } = require('./helpers/wp-session');

test.skip(!isConfigured(), 'E2E_BASE_URL is not set');

const BANDS = [
	{ name: 'wide-1400', width: 1400 },
	{ name: 'narrow-1100', width: 1100 },
	{ name: 'tablet-720', width: 720 },
	{ name: 'mobile-400', width: 400 },
];

for (const band of BANDS) {
	test(`S1.10 @${band.name} — live bar (closed dropdown) has zero axe violations scoped to the trigger subtree`, async ({ page }) => {
		await page.setViewportSize({ width: band.width, height: 800 });
		await loginToWp(page);
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });

		// On wide desktop the trigger itself is CSS-hidden (Decision 7);
		// nothing to audit in that case beyond the static fixture.
		const triggerVisible = await page.evaluate(() => {
			const t = document.getElementById('wp-admin-bar-overflow-plugins');
			return t ? getComputedStyle(t).display !== 'none' : false;
		});
		if (!triggerVisible) {
			test.info().annotations.push({ type: 'note', description: 'Trigger CSS-hidden at this band; audit skipped.' });
			return;
		}

		const results = await new AxeBuilder({ page })
			.include('#wp-admin-bar-overflow-plugins')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();

		if (results.violations.length > 0) {
			console.log(`[${band.name}] violations:`, JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2));
		}
		expect(results.violations).toEqual([]);
	});

	test(`S1.10 @${band.name} — live bar (open dropdown) has zero axe violations scoped to the trigger subtree`, async ({ page }) => {
		await page.setViewportSize({ width: band.width, height: 800 });
		await loginToWp(page);
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });

		const triggerVisible = await page.evaluate(() => {
			const t = document.getElementById('wp-admin-bar-overflow-plugins');
			return t ? getComputedStyle(t).display !== 'none' : false;
		});
		if (!triggerVisible) {
			test.info().annotations.push({ type: 'note', description: 'Trigger CSS-hidden at this band; audit skipped.' });
			return;
		}

		// Force the dropdown open via the runtime's click handler.
		await page.locator('#wp-admin-bar-overflow-plugins > a.ab-item').click();
		await page.waitForFunction(
			() => document.querySelector('#wp-admin-bar-overflow-plugins')?.classList.contains('hover')
		);

		const results = await new AxeBuilder({ page })
			.include('#wp-admin-bar-overflow-plugins')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();

		if (results.violations.length > 0) {
			console.log(`[${band.name}] open-state violations:`, JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2));
		}
		expect(results.violations).toEqual([]);
	});
}
