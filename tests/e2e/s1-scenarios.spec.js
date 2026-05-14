/**
 * Phase A.1 S1.x scenario coverage. Requires `E2E_BASE_URL` pointing at a
 * WP install with the plugin active + at least one third-party plugin
 * registering an admin-bar node (the F1 fixture: Query Monitor + Yoast SEO
 * + Jetpack modules suffices).
 */

const { test, expect } = require('@playwright/test');
const { baseUrl, isConfigured, loginToWp } = require('./helpers/wp-session');

test.skip(!isConfigured(), 'E2E_BASE_URL is not set');

test.describe('A.1 S1.x scenarios', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await loginToWp(page);
	});

	test('S1.1 trigger placement: sits BEFORE my-account in top-secondary at narrow desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });

		// Precondition: at least one Core right-side <li> exists.
		const myAccount = page.locator('#wp-admin-bar-my-account');
		await expect(myAccount).toHaveCount(1);

		const order = await page.evaluate(() =>
			Array.from(document.querySelectorAll('#wp-admin-bar-top-secondary > li')).map((li) => li.id)
		);
		const triggerIdx = order.indexOf('wp-admin-bar-overflow-plugins');
		const myAccountIdx = order.indexOf('wp-admin-bar-my-account');
		expect(triggerIdx).toBeGreaterThan(-1);
		expect(myAccountIdx).toBeGreaterThan(-1);
		expect(triggerIdx).toBeLessThan(myAccountIdx);
	});

	test('S1.3 click opens dropdown: aria-expanded flips on trigger anchor when trigger is visible', async ({ page }) => {
		await page.setViewportSize({ width: 720, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => {
			const trigger = document.getElementById('wp-admin-bar-overflow-plugins');
			return trigger && getComputedStyle(trigger).display !== 'none';
		});

		const anchor = page.locator('#wp-admin-bar-overflow-plugins > a.ab-item');
		await expect(anchor).toHaveAttribute('aria-expanded', 'false');

		await anchor.click();

		await expect(anchor).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('#wp-admin-bar-overflow-plugins')).toHaveClass(/(^| )hover( |$)/);

		const subWrapperDisplay = await page.evaluate(() => {
			const w = document.querySelector('#wp-admin-bar-overflow-plugins .ab-sub-wrapper');
			return w ? getComputedStyle(w).display : null;
		});
		expect(subWrapperDisplay).not.toBe('none');
	});

	test('S1.3b aria-expanded toggle lands on the trigger anchor, not on mirror anchors', async ({ page }) => {
		await page.setViewportSize({ width: 720, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => {
			const trigger = document.getElementById('wp-admin-bar-overflow-plugins');
			return trigger && getComputedStyle(trigger).display !== 'none';
		});

		const triggerAnchor = page.locator('#wp-admin-bar-overflow-plugins > a.ab-item');
		await triggerAnchor.click();
		await expect(triggerAnchor).toHaveAttribute('aria-expanded', 'true');

		const mirrorAnchorState = await page.evaluate(() => {
			const mirrors = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-mirror'));
			return mirrors.map((m) => {
				const a = m.querySelector('a');
				return { id: m.id, hasAriaExpanded: a?.hasAttribute('aria-expanded'), value: a?.getAttribute('aria-expanded') };
			});
		});
		for (const state of mirrorAnchorState) {
			if (state.hasAriaExpanded) {
				expect(state.value).toBe('false');
			}
		}
	});

	test('S1.5 click forwarding: clicking a mirror anchor triggers the original anchor', async ({ page }) => {
		// Mobile viewport so the mirror is visible inside the dropdown
		// without needing the narrow-desktop overflow class.
		await page.setViewportSize({ width: 500, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => !!document.getElementById('wp-admin-bar-mirror-query-monitor'));

		await page.evaluate(() => {
			const original = document.getElementById('wp-admin-bar-query-monitor');
			const anchor = original?.querySelector('a');
			if (!anchor) return;
			window.__qmOriginalClicks = 0;
			anchor.addEventListener('click', (e) => {
				window.__qmOriginalClicks += 1;
				e.preventDefault();
			});
		});

		await page.locator('#wp-admin-bar-overflow-plugins > a.ab-item').click();
		await page.locator('#wp-admin-bar-mirror-query-monitor > a.ab-item').click();

		const clicks = await page.evaluate(() => window.__qmOriginalClicks);
		expect(clicks).toBeGreaterThan(0);
	});

	test('S1.6 mutation propagation: text change on original reflects on mirror', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => !!document.getElementById('wp-admin-bar-mirror-query-monitor'));

		await page.evaluate(() => {
			const original = document.getElementById('wp-admin-bar-query-monitor');
			const anchor = original?.querySelector('a.ab-item');
			if (anchor) anchor.textContent = 'QM-CHANGED-PROBE';
		});

		await page.waitForFunction(
			() => {
				const m = document.getElementById('wp-admin-bar-mirror-query-monitor');
				return m && (m.querySelector('a.ab-item')?.textContent || '').includes('QM-CHANGED-PROBE');
			},
			null,
			{ timeout: 500 }
		);
	});

	test('S1.9 at ≤ 600px all plugin-classified originals are hidden; trigger reachable + ≥ 44px tap target', async ({ page }) => {
		await page.setViewportSize({ width: 400, height: 800 });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => !!document.getElementById('wp-admin-bar-overflow-plugins'));

		const snapshot = await page.evaluate(() => {
			const originals = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-classified-plugin-node'))
				.map((el) => ({ id: el.id, offsetWidth: el.offsetWidth, display: getComputedStyle(el).display }));
			const trigger = document.getElementById('wp-admin-bar-overflow-plugins');
			const triggerAnchor = trigger?.querySelector('a.ab-item');
			const anchorRect = triggerAnchor?.getBoundingClientRect();
			return {
				originals,
				triggerDisplay: trigger ? getComputedStyle(trigger).display : null,
				anchorWidth: anchorRect?.width ?? 0,
				anchorHeight: anchorRect?.height ?? 0,
			};
		});

		for (const o of snapshot.originals) {
			expect(o.display).toBe('none');
			expect(o.offsetWidth).toBe(0);
		}
		expect(snapshot.triggerDisplay).not.toBe('none');
		expect(snapshot.anchorWidth).toBeGreaterThanOrEqual(44);
		expect(snapshot.anchorHeight).toBeGreaterThanOrEqual(44);
	});
});
