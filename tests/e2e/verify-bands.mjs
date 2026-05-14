#!/usr/bin/env node
/**
 * Quick band-verification harness. Drives a single Playwright page across
 * three viewport bands (wide-1400, narrow-900, mobile-400) and reports
 * trigger visibility + original visibility + mirror state at each.
 *
 * Usage:
 *   E2E_BASE_URL=… E2E_USER=… E2E_PASS=… node tests/e2e/verify-bands.mjs
 */

import { chromium } from 'playwright';

const baseUrl = (process.env.E2E_BASE_URL || '').replace(/\/$/, '');
const user = process.env.E2E_USER || 'demo';
const pass = process.env.E2E_PASS || '';
if (!baseUrl || !pass) {
	console.error('Set E2E_BASE_URL, E2E_USER, E2E_PASS');
	process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${baseUrl}/wp-login.php`);
await page.fill('#user_login', user);
await page.fill('#user_pass', pass);
await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);

async function probe(label, width) {
	await page.setViewportSize({ width, height: 800 });
	await page.goto(`${baseUrl}/wp-admin/`, { waitUntil: 'networkidle' });
	// Let ResizeObserver settle.
	await page.waitForTimeout(200);
	const snapshot = await page.evaluate(() => {
		const trigger = document.getElementById('wp-admin-bar-overflow-plugins');
		const triggerDisplay = trigger ? getComputedStyle(trigger).display : null;
		const originals = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-classified-plugin-node'))
			.map((el) => ({
				id: el.id,
				offsetWidth: el.offsetWidth,
				display: getComputedStyle(el).display,
			}));
		const mirrors = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-mirror'))
			.map((el) => ({
				id: el.id,
				hasShown: el.classList.contains('wp-admin-bar-overflow-mirror-shown'),
				display: getComputedStyle(el).display,
			}));
		return {
			innerWidth: window.innerWidth,
			barWidth: document.getElementById('wpadminbar')?.offsetWidth ?? null,
			triggerDisplay,
			originals,
			mirrors,
		};
	});
	console.log(`\n=== ${label} (viewport=${width}px) ===`);
	console.log(JSON.stringify(snapshot, null, 2));
}

await probe('wide-1400', 1400);
await probe('narrow-900', 900);
await probe('narrow-720', 720);
await probe('mobile-400', 400);

await browser.close();
