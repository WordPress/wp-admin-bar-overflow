/**
 * A.1 visual regression coverage for the overflow trigger and mirror panel.
 *
 * Uses a static admin-bar fixture with many plugin nodes so the cutoff logic
 * is deterministic and does not depend on a live plugin-heavy WordPress site.
 */

const { test, expect } = require('@playwright/test');
const { build } = require('esbuild');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
let runtime = null;

test.beforeAll(async () => {
	const [js, css] = await Promise.all([
		build({
			entryPoints: [resolve(ROOT, 'src/js/index.js')],
			bundle: true,
			write: false,
			logLevel: 'silent',
		}),
		build({
			entryPoints: [resolve(ROOT, 'src/css/index.css')],
			bundle: true,
			write: false,
			logLevel: 'silent',
			loader: { '.css': 'css' },
		}),
	]);
	runtime = {
		js: js.outputFiles[0].text,
		css: css.outputFiles[0].text,
	};
});

test.describe('A.1 visual regressions', () => {
	test('S1.29 hides the narrow-desktop trigger when no plugin nodes overflow', async ({ page }) => {
		await loadFixture(page, { width: 1100, pluginCount: 2 });

		const state = await page.evaluate(() => ({
			triggerDisplay: getComputedStyle(document.getElementById('wp-admin-bar-overflow-plugins')).display,
			shownMirrors: document.querySelectorAll('.wp-admin-bar-overflow-mirror-shown').length,
			hiddenOriginals: document.querySelectorAll('.wp-admin-bar-overflow-hidden-by-overflow').length,
		}));

		expect(state.triggerDisplay).toBe('none');
		expect(state.shownMirrors).toBe(0);
		expect(state.hiddenOriginals).toBe(0);
	});

	test('S1.30 and S1.31 keep the trigger in-row and avoid top-level overlaps at tight desktop widths', async ({ page }) => {
		for (const width of [850, 875, 900]) {
			await loadFixture(page, { width, pluginCount: 18 });

			const state = await page.evaluate(() => {
				const trigger = document.getElementById('wp-admin-bar-overflow-plugins');
				const visibleItems = Array.from(
					document.querySelectorAll('#wp-admin-bar-root-default > li, #wp-admin-bar-top-secondary > li')
				).filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0);
				const rects = visibleItems.map((el) => {
					const r = el.getBoundingClientRect();
					return {
						id: el.id,
						left: r.left,
						right: r.right,
						top: r.top,
						bottom: r.bottom,
					};
				});
				const overlaps = [];
				for (let i = 0; i < rects.length; i++) {
					for (let j = i + 1; j < rects.length; j++) {
						const xOverlap = Math.min(rects[i].right, rects[j].right) - Math.max(rects[i].left, rects[j].left);
						const yOverlap = Math.min(rects[i].bottom, rects[j].bottom) - Math.max(rects[i].top, rects[j].top);
						if (xOverlap > 1 && yOverlap > 1) {
							overlaps.push(`${rects[i].id}:${rects[j].id}`);
						}
					}
				}
				const triggerRect = trigger.getBoundingClientRect();
				return {
					triggerDisplay: getComputedStyle(trigger).display,
					triggerTop: triggerRect.top,
					triggerHeight: triggerRect.height,
					shownMirrors: document.querySelectorAll('.wp-admin-bar-overflow-mirror-shown').length,
					overlaps,
				};
			});

			expect(state.triggerDisplay).not.toBe('none');
			expect(state.triggerTop).toBeGreaterThanOrEqual(0);
			expect(state.triggerTop).toBeLessThan(2);
			expect(state.triggerHeight).toBeGreaterThan(0);
			expect(state.shownMirrors).toBeGreaterThan(0);
			expect(state.overlaps).toEqual([]);
		}
	});

	test('S1.32 contains the mobile dropdown within the viewport', async ({ page }) => {
		await loadFixture(page, { width: 492, height: 745, pluginCount: 30 });
		await page.locator('#wp-admin-bar-overflow-plugins > a.ab-item').click();

		const panel = await page.evaluate(() => {
			const wrapper = document.querySelector('#wp-admin-bar-overflow-plugins > .ab-sub-wrapper');
			const r = wrapper.getBoundingClientRect();
			return {
				left: r.left,
				right: r.right,
				width: r.width,
				viewportWidth: window.innerWidth,
				clientHeight: wrapper.clientHeight,
				scrollHeight: wrapper.scrollHeight,
				mirrorCount: document.querySelectorAll('.wp-admin-bar-overflow-mirror').length,
			};
		});

		expect(panel.left).toBeGreaterThanOrEqual(-1);
		expect(panel.right).toBeLessThanOrEqual(panel.viewportWidth + 1);
		expect(panel.width).toBeGreaterThanOrEqual(panel.viewportWidth - 1);
		expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
		expect(panel.mirrorCount).toBe(30);
	});

	test('S1.33 gives icon-only mirrors visible labels and aligned rows', async ({ page }) => {
		await loadFixture(page, { width: 741, height: 745, pluginCount: 12 });
		await page.locator('#wp-admin-bar-overflow-plugins > a.ab-item').click();

		const yoast = await page.evaluate(() => {
			const mirror = document.getElementById('wp-admin-bar-mirror-wpseo-menu');
			const anchor = mirror.querySelector(':scope > a.ab-item');
			const label = anchor.querySelector('.wp-admin-bar-overflow-mirror-label');
			const badge = anchor.querySelector('.wp-ui-notification');
			const icon = anchor.querySelector('#wp-admin-bar-mirror-yoast-ab-icon');
			const ar = anchor.getBoundingClientRect();
			const lr = label.getBoundingClientRect();
			const br = badge.getBoundingClientRect();
			const ir = icon.getBoundingClientRect();
			const iconStyle = getComputedStyle(icon);
			const mid = (rect) => rect.top + rect.height / 2;
			return {
				labelText: label.textContent.trim(),
				labelWidth: lr.width,
				badgeWidth: br.width,
				badgeHeight: br.height,
				iconWidth: ir.width,
				iconHeight: ir.height,
				iconBackgroundSize: iconStyle.backgroundSize,
				iconBackgroundPosition: iconStyle.backgroundPosition,
				labelMidDelta: Math.abs(mid(lr) - mid(ar)),
				badgeMidDelta: Math.abs(mid(br) - mid(ar)),
				iconMidDelta: Math.abs(mid(ir) - mid(ar)),
			};
		});

		expect(yoast.labelText).toBe('Yoast SEO');
		expect(yoast.labelWidth).toBeGreaterThan(40);
		expect(Math.abs(yoast.badgeWidth - yoast.badgeHeight)).toBeLessThanOrEqual(2);
		expect(yoast.iconWidth).toBe(20);
		expect(yoast.iconHeight).toBe(20);
		expect(yoast.iconBackgroundSize).toBe('20px 20px');
		expect(yoast.labelMidDelta).toBeLessThanOrEqual(2);
		expect(yoast.badgeMidDelta).toBeLessThanOrEqual(2);
		expect(yoast.iconMidDelta).toBeLessThanOrEqual(2);
	});

	test('S1.34 keeps an overflowing mirror visible after mutation refresh', async ({ page }) => {
		await loadFixture(page, { width: 900, pluginCount: 18 });

		const target = await page.evaluate(() => {
			const mirror = document.querySelector('.wp-admin-bar-overflow-mirror-shown');
			const originalId = mirror.getAttribute('data-mirror-of');
			const original = document.getElementById(originalId);
			const anchor = original.querySelector(':scope > a.ab-item');
			anchor.textContent = 'Mutated plugin label';
			return mirror.id;
		});

		await page.waitForFunction(
			(mirrorId) => {
				const mirror = document.getElementById(mirrorId);
				return (
					mirror &&
					mirror.classList.contains('wp-admin-bar-overflow-mirror-shown') &&
					(mirror.textContent || '').includes('Mutated plugin label')
				);
			},
			target,
			{ timeout: 500 }
		);
	});
});

async function loadFixture(page, { width, height = 800, pluginCount }) {
	await page.setViewportSize({ width, height });
	await page.setContent(buildFixtureHtml(pluginCount), { waitUntil: 'domcontentloaded' });
	await page.addStyleTag({ content: runtime.css });
	await page.addScriptTag({ content: runtime.js });
	await page.waitForFunction(
		(count) => document.querySelectorAll('.wp-admin-bar-overflow-mirror').length === count,
		pluginCount
	);
	await page.waitForFunction(() => document.body.dataset.wpaboReady === '1');
}

function buildFixtureHtml(pluginCount) {
	const nodes = buildNavNodes(pluginCount);
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>A.1 visual regression fixture</title>
	<style>${coreAdminBarCss()}</style>
</head>
<body>
<div id="wpadminbar" role="navigation" aria-label="Toolbar">
	<div id="wp-toolbar" role="menubar" aria-label="Top Toolbar">
		<ul id="wp-admin-bar-root-default" class="ab-top-menu" role="none">
			<li id="wp-admin-bar-wp-logo" role="none"><a class="ab-item" href="#" role="menuitem">W</a></li>
			<li id="wp-admin-bar-site-name" role="none"><a class="ab-item" href="#" role="menuitem">Spectacled Parrot Scarlet</a></li>
			<li id="wp-admin-bar-edit" role="none"><a class="ab-item" href="#" role="menuitem">Edit Site</a></li>
			<li id="wp-admin-bar-comments" role="none"><a class="ab-item" href="#" role="menuitem">0</a></li>
			<li id="wp-admin-bar-new-content" role="none"><a class="ab-item" href="#" role="menuitem">New</a></li>
			${pluginItems(pluginCount)}
		</ul>
		<ul id="wp-admin-bar-top-secondary" class="ab-top-secondary ab-top-menu" role="none">
			<li id="wp-admin-bar-overflow-plugins" class="menupop wp-admin-bar-overflow-trigger" role="none">
				<a class="ab-item" href="#" onclick="return false;" role="menuitem" aria-expanded="false" aria-haspopup="menu">
					<span class="screen-reader-text">Plugins</span>
				</a>
				<div class="ab-sub-wrapper" role="none">
					<ul id="wp-admin-bar-overflow-plugins-default" class="ab-submenu" role="menu" aria-label="Plugins overflow">
						<li id="wp-admin-bar-overflow-placeholder" class="wp-admin-bar-overflow-placeholder" role="none">
							<div class="ab-item ab-empty-item" aria-hidden="true"></div>
						</li>
					</ul>
				</div>
			</li>
			<li id="wp-admin-bar-my-account" role="none"><a class="ab-item" href="#" role="menuitem">Howdy, demo</a></li>
			<li id="wp-admin-bar-search" role="none"><a class="ab-item" href="#" role="menuitem">Search</a></li>
		</ul>
	</div>
</div>
<main><h1>Fixture</h1></main>
<script type="application/json" id="wp-admin-bar-overflow-data">${JSON.stringify({
	version: 1,
	enabled: true,
	nodes,
	dropdown: { id: 'overflow-plugins', label: 'Plugins', emptyMessage: '' },
	breakpoints: { narrowDesktop: 1280, tablet: 782, mobile: 600 },
	flags: { debug: false },
})}</script>
<script>requestAnimationFrame(() => { document.body.dataset.wpaboReady = '1'; });</script>
</body>
</html>`;
}

function buildNavNodes(pluginCount) {
	const nodes = [
		pluginNode('query-monitor', 'Query Monitor', 10),
		pluginNode('wpseo-menu', 'Yoast SEO', 20),
	];
	for (let i = 3; i <= pluginCount; i++) {
		nodes.push(pluginNode(`plugin-${i}`, `Plugin ${i}`, 20 + i));
	}
	return nodes;
}

function pluginNode(rawId, canonical, priority) {
	return {
		nodeId: `wp-admin-bar-${rawId}`,
		rawId,
		class: 'plugin',
		parent: null,
		priority,
		labels: { canonical, screen_reader: null },
		icon: { kind: 'none', ref: null },
		badge: { text: null, attention: false },
		href: '#',
		submenuChildren: [],
	};
}

function pluginItems(pluginCount) {
	const items = [
		`<li id="wp-admin-bar-query-monitor" role="none"><a class="ab-item" href="#" role="menuitem">0.60s 50.6MB 0.00s 4Q</a></li>`,
		`<li id="wp-admin-bar-wpseo-menu" role="none"><a class="ab-item" href="#" role="menuitem"><div id="wp-admin-bar-yoast-ab-icon" class="ab-item yoast-logo svg"><span class="screen-reader-text">SEO</span></div><span class="wp-ui-notification yoast-issue-counter">2</span></a></li>`,
	];
	for (let i = 3; i <= pluginCount; i++) {
		items.push(`<li id="wp-admin-bar-plugin-${i}" role="none"><a class="ab-item" href="#" role="menuitem">Plugin ${i}</a></li>`);
	}
	return items.join('\n');
}

function coreAdminBarCss() {
	return `
		body { margin: 0; padding-top: 32px; font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
		#wpadminbar { background: #1d2327; color: #f0f0f1; font: 13px/32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; height: 32px; left: 0; min-width: 0; position: fixed; top: 0; width: 100%; z-index: 99999; }
		#wpadminbar ul { list-style: none; margin: 0; padding: 0; }
		#wpadminbar li { float: left; margin: 0; padding: 0; position: relative; }
		#wpadminbar #wp-admin-bar-root-default { float: left; }
		#wpadminbar #wp-admin-bar-top-secondary { float: right; }
		#wpadminbar .ab-item { color: #f0f0f1; display: block; height: 32px; line-height: 32px; padding: 0 8px; text-decoration: none; white-space: nowrap; }
		#wpadminbar .ab-sub-wrapper { background: #2c3338; box-shadow: 0 3px 5px rgba(0, 0, 0, .25); display: none; position: absolute; right: 0; top: 32px; }
		#wpadminbar .menupop.hover > .ab-sub-wrapper { display: block; }
		#wpadminbar .ab-submenu { display: block; float: none; }
		#wpadminbar .ab-submenu li { display: block; float: none; }
		#wpadminbar .ab-submenu .ab-item { height: auto; line-height: 20px; padding: 8px 10px; }
		#wpadminbar .wp-ui-notification { align-items: center; background: #d63638; border-radius: 12px; color: #fff; display: inline-flex; font-size: 11px; height: 18px; justify-content: center; line-height: 18px; min-width: 18px; }
		.yoast-logo { background: #8c8f94; border-radius: 2px; }
		.yoast-logo.svg { background-position: 50% 8px; background-repeat: no-repeat; background-size: 30px; }
		.yoast-issue-counter { height: 32px; line-height: 32px; padding: 1px 7px 1px 6px; }
		.screen-reader-text { border: 0; clip: rect(1px, 1px, 1px, 1px); clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; word-wrap: normal !important; }
		@media (max-width: 782px) {
			body { padding-top: 46px; }
			#wpadminbar { font-size: 14px; height: 46px; line-height: 46px; }
			#wpadminbar .ab-item { height: 46px; line-height: 46px; }
			#wpadminbar .ab-submenu .ab-item { height: auto; line-height: 20px; }
			#wpadminbar .ab-label { clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; }
		}
	`;
}
