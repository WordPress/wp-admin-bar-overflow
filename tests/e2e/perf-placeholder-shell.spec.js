/**
 * Item 6 of the A.1 entry checkpoint: placeholder-shell rendering.
 *
 * Asserts that with the plugin active on a site that has at least one
 * plugin-classified node:
 *
 *   - `#wp-admin-bar-overflow-plugins` exists
 *   - the parent `<li>` carries the `menupop` class
 *   - the trigger `<a>` carries `aria-expanded='false'` server-emitted
 *   - the trigger anchor has `href="#"` and `onclick="return false;"`
 *   - `<div class='ab-sub-wrapper'>` is present inside the trigger
 *   - the inline `<style id="wp-admin-bar-overflow-runtime-style">`
 *     block appears in the document HTML before `<div id="wpadminbar">`
 */

const { test, expect } = require('@playwright/test');
const { baseUrl, isConfigured, loginToWp } = require('./helpers/wp-session');

test.skip(!isConfigured(), 'E2E_BASE_URL is not set');

test('trigger renders with menupop + aria-expanded + sub-wrapper', async ({ page }) => {
	await loginToWp(page);
	await page.goto(`${baseUrl()}/wp-admin/`);

	const trigger = page.locator('#wp-admin-bar-overflow-plugins');
	await expect(trigger).toHaveCount(1);
	await expect(trigger).toHaveClass(/menupop/);

	const anchor = trigger.locator('> a.ab-item').first();
	await expect(anchor).toHaveAttribute('aria-expanded', 'false');
	await expect(anchor).toHaveAttribute('href', '#');
	await expect(anchor).toHaveAttribute('onclick', /return\s+false/i);

	const subWrapper = trigger.locator('> .ab-sub-wrapper');
	await expect(subWrapper).toHaveCount(1);
});

test('inline placeholder-hide style block lands before #wpadminbar in document HTML', async ({ page }) => {
	await loginToWp(page);
	const response = await page.goto(`${baseUrl()}/wp-admin/`);
	const html = await response.text();

	const styleIdx = html.indexOf('<style id="wp-admin-bar-overflow-runtime-style">');
	const barIdx = html.indexOf('<div id="wpadminbar"');

	expect(styleIdx).toBeGreaterThan(-1);
	expect(barIdx).toBeGreaterThan(-1);
	expect(styleIdx).toBeLessThan(barIdx);
	expect(html).toMatch(/\.wp-admin-bar-overflow-placeholder\s*\{\s*display\s*:\s*none\s*\}/);
});
