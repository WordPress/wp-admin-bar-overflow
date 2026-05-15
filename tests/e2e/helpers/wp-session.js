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
	return BASE_URL.replace(/\/$/, '');
}

function isConfigured() {
	return BASE_URL !== '' || AUTO_LOGIN_URL !== '';
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
		return;
	}
	await page.goto(`${baseUrl()}/wp-login.php`);
	await page.fill('#user_login', USER);
	await page.fill('#user_pass', PASS);
	await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
}

module.exports = {
	BASE_URL,
	DEBUG_ENABLED,
	baseUrl,
	isConfigured,
	loginToWp,
};
