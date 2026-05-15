#!/usr/bin/env node
/**
 * One-shot Playwright setup that installs the prototype plugin onto a
 * Jurassic Ninja site (or any WP install with an auto_login URL) and
 * activates the fixture plugins so the A.1 entry-checkpoint perf scripts
 * can run.
 *
 * Usage:
 *   E2E_AUTO_LOGIN=https://<site>.jurassic.ninja/?auto_login \
 *   PLUGIN_ZIP=/abs/path/to/wp-admin-bar-overflow.zip \
 *     node tests/e2e/setup-jn-site.mjs
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const autoLogin = process.env.E2E_AUTO_LOGIN;
const zipPath = process.env.PLUGIN_ZIP;
const user = process.env.E2E_USER || '';
const pass = process.env.E2E_PASS || '';

if (!autoLogin) {
	console.error('E2E_AUTO_LOGIN env var is required');
	process.exit(1);
}
if (!zipPath || !existsSync(zipPath)) {
	console.error(`PLUGIN_ZIP env var must point at an existing file (got: ${zipPath})`);
	process.exit(1);
}

const baseUrl = new URL(autoLogin).origin;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (msg) => {
	if (msg.type() === 'error') console.error('console.error:', msg.text());
});

console.log(`> Auto-login: ${autoLogin}`);
await page.goto(autoLogin, { waitUntil: 'domcontentloaded' });
try {
	await page.waitForURL(/wp-admin/, { timeout: 10000 });
} catch (err) {
	if (!user || !pass) {
		throw err;
	}
		console.log('> Auto-login did not land in wp-admin, using password login...');
		await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
		await page.fill('#user_login', user);
		await page.fill('#user_pass', pass);
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
			page.click('#wp-submit'),
		]);
		await page.goto(`${baseUrl}/wp-admin/`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('#wpadminbar', { timeout: 15000 });
	}
console.log(`> Logged in, now at: ${page.url()}`);

console.log('> Navigating to plugin upload page...');
await page.goto(`${baseUrl}/wp-admin/plugin-install.php?tab=upload`, { waitUntil: 'domcontentloaded' });

console.log(`> Uploading: ${zipPath}`);
await page.setInputFiles('#pluginzip', zipPath);
await page.click('#install-plugin-submit');
await page.waitForLoadState('networkidle', { timeout: 60000 });

const replaceHref = await page.evaluate(() => {
	const link = Array.from(document.querySelectorAll('a, button')).find((el) =>
		/Replace current with uploaded/i.test(el.textContent || '')
	);
	return link && link.tagName === 'A' ? link.href : null;
});
if (replaceHref) {
	console.log(`> Replacing existing install via: ${replaceHref}`);
	await page.goto(replaceHref, { waitUntil: 'networkidle' });
}

const activated = await page.evaluate(() => {
	const link = Array.from(document.querySelectorAll('a')).find((a) => /Activate Plugin/i.test(a.textContent || ''));
	return link ? link.href : null;
});

if (activated) {
	console.log(`> Activating via: ${activated}`);
	await page.goto(activated, { waitUntil: 'networkidle' });
} else {
	console.log('> "Activate Plugin" link not found, plugin may already be active or install failed.');
}

console.log('> Visiting /wp-admin/plugins.php for confirmation...');
await page.goto(`${baseUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });

const installed = await page.evaluate(() => {
	const rows = Array.from(document.querySelectorAll('tr[data-slug]'));
	return rows.map((r) => ({
		slug: r.getAttribute('data-slug'),
		active: r.classList.contains('active'),
	}));
});
console.log('> Plugin states:');
for (const p of installed) {
	console.log(`    ${p.active ? 'ACTIVE  ' : 'inactive'} ${p.slug}`);
}

await browser.close();
