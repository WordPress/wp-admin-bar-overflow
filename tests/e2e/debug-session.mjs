#!/usr/bin/env node
/**
 * Diagnose what Playwright sees when it lands on /wp-admin/ after auto_login.
 */

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', (msg) => {
	if (msg.type() === 'error') console.error('[console.error]', msg.text());
});

console.log('1) GET /?auto_login');
const res1 = await page.goto('https://spectacled-parrot-scarlet.jurassic.ninja/?auto_login', { waitUntil: 'networkidle' });
console.log('   final URL:', page.url());
console.log('   status:', res1?.status());

console.log('2) GET /wp-admin/');
const res2 = await page.goto('https://spectacled-parrot-scarlet.jurassic.ninja/wp-admin/', { waitUntil: 'domcontentloaded' });
console.log('   final URL:', page.url());
console.log('   status:', res2?.status());

const summary = await page.evaluate(() => ({
	hasBar: !!document.getElementById('wpadminbar'),
	hasDataEl: !!document.getElementById('wp-admin-bar-overflow-data'),
	hasScript: !!document.getElementById('wp-admin-bar-overflow-runtime-js'),
	omnibarPlugins: typeof window.omnibarPlugins,
	debugExposed: typeof window.omnibarPlugins?.debug,
	observerCount: window.omnibarPlugins?.debug?.observerCount,
	bodyClass: document.body.className.slice(0, 200),
	titleText: document.title,
}));
console.log('3) Page state:', summary);

await browser.close();
