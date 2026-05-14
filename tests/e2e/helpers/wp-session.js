/**
 * Shared helpers for Playwright tests that need a live WordPress install.
 *
 * Tests skip when `E2E_BASE_URL` is unset, so the CI suite passes without
 * a live WP. The env contract:
 *
 *   E2E_BASE_URL  → e.g. `https://my-site.jurassic.ninja`
 *   E2E_USER      → admin username (default: `wordpress`)
 *   E2E_PASS      → admin password (default: `wordpress`)
 *   E2E_DEBUG     → when set to `1`, asserts assume the WP install has
 *                   `WP_ADMIN_BAR_OVERFLOW_DEBUG` defined; otherwise the
 *                   debug API is not expected to be present.
 */

const BASE_URL = process.env.E2E_BASE_URL || '';
const USER = process.env.E2E_USER || 'wordpress';
const PASS = process.env.E2E_PASS || 'wordpress';
const AUTO_LOGIN_URL = process.env.E2E_AUTO_LOGIN || '';
const DEBUG_ENABLED = process.env.E2E_DEBUG === '1';

function baseUrl() {
	if (BASE_URL) return BASE_URL.replace(/\/$/, '');
	if (!AUTO_LOGIN_URL) return '';
	try {
		return new URL(AUTO_LOGIN_URL).origin;
	} catch (err) {
		return '';
	}
}

function isConfigured() {
	return baseUrl() !== '';
}

async function loginToWp(page) {
	if (AUTO_LOGIN_URL) {
		// JN's companion plugin auto-logs-in the `demo` user when the
		// `auto_login` query param is present and `auto_login` option is 1.
		// The redirect chain typically lands on the site root; a follow-up
		// navigation to /wp-admin/ then hits the dashboard with the auth
		// cookie attached.
		await page.goto(AUTO_LOGIN_URL, { waitUntil: 'networkidle' });
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'domcontentloaded' });
		if (await hasAdminBar(page)) return;
	}

	await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'domcontentloaded' });
	if (await hasAdminBar(page)) return;

	for (let attempt = 0; attempt < 3; attempt++) {
		await page.goto(`${baseUrl()}/wp-login.php`, { waitUntil: 'domcontentloaded' });
		await page.locator('#user_login').fill(USER);
		await page.locator('#user_pass').fill(PASS);
		await page.locator('#rememberme').check().catch(() => null);
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
			page.locator('#wp-submit').click(),
		]);
		await page.goto(`${baseUrl()}/wp-admin/`, { waitUntil: 'domcontentloaded' });
		if (await hasAdminBar(page)) return;
	}
	await page.waitForSelector('#wpadminbar', { timeout: 15000 });
}

async function hasAdminBar(page) {
	return page.locator('#wpadminbar').count().then((count) => count > 0).catch(() => false);
}

module.exports = {
	BASE_URL,
	DEBUG_ENABLED,
	baseUrl,
	isConfigured,
	loginToWp,
};
