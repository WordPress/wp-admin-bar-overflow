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

	test('S1.35 overflows plugin nodes from the visual right edge first', async ({ page }) => {
		await loadFixture(page, { width: 900, pluginCount: 6, variant: 'out-of-order' });

		const firstState = await visualOverflowState(page);
		expect(firstState.hiddenCount).toBeGreaterThan(0);
		expect(firstState.hiddenCount).toBeLessThan(firstState.visualOrder.length);
		expect(firstState.inlineThenHidden).toEqual(firstState.visualOrder);
		expect(firstState.shownMirrorOriginalIds).toEqual(firstState.hiddenIds.slice().reverse());

		await page.setViewportSize({ width: 783, height: 800 });
		await flushResize(page);
		const narrowState = await visualOverflowState(page);
		expect(narrowState.hiddenCount).toBeGreaterThan(firstState.hiddenCount);
		expect(narrowState.inlineThenHidden).toEqual(narrowState.visualOrder);
		expect(narrowState.shownMirrorOriginalIds).toEqual(narrowState.hiddenIds.slice().reverse());

		await page.setViewportSize({ width: 900, height: 800 });
		await flushResize(page);
		const secondState = await visualOverflowState(page);
		expect(secondState.hiddenIds).toEqual(firstState.hiddenIds);
		expect(secondState.inlineThenHidden).toEqual(secondState.visualOrder);
		expect(secondState.shownMirrorOriginalIds).toEqual(firstState.shownMirrorOriginalIds);
	});

	test('S1.36 prevents wide desktop admin-bar wrapping under heavy plugin pressure', async ({ page }) => {
		await loadFixture(page, { width: 1400, pluginCount: 30 });

		const state = await page.evaluate(() => {
			const barTop = document.getElementById('wpadminbar').getBoundingClientRect().top;
			const visibleTopLevelItems = Array.from(
				document.querySelectorAll('#wp-admin-bar-root-default > li, #wp-admin-bar-top-secondary > li')
			).filter((el) => getComputedStyle(el).display !== 'none');
			const wrappedIds = visibleTopLevelItems
				.filter((el) => Math.abs(el.getBoundingClientRect().top - barTop) > 1)
				.map((el) => el.id);
			const hiddenOriginalIds = Array.from(
				document.querySelectorAll('.wp-admin-bar-overflow-classified-plugin-node.wp-admin-bar-overflow-hidden-by-overflow')
			).map((el) => el.id);
			const shownMirrorOriginalIds = Array.from(
				document.querySelectorAll('#wp-admin-bar-overflow-plugins-default > .wp-admin-bar-overflow-mirror-shown')
			).map((el) => el.getAttribute('data-mirror-of'));

			return {
				triggerDisplay: getComputedStyle(document.getElementById('wp-admin-bar-overflow-plugins')).display,
				triggerActive: document
					.getElementById('wp-admin-bar-overflow-plugins')
					.classList.contains('wp-admin-bar-overflow-trigger-active'),
				wrappedIds,
				hiddenOriginalIds,
				shownMirrorOriginalIds,
			};
		});

		expect(state.triggerDisplay).not.toBe('none');
		expect(state.triggerActive).toBe(true);
		expect(state.wrappedIds).toEqual([]);
		expect(state.hiddenOriginalIds.length).toBeGreaterThan(0);
		expect(state.shownMirrorOriginalIds).toEqual(state.hiddenOriginalIds.slice().reverse());
	});

	test('S1.37 discovers DOM-only top-level plugin nodes before visual cutoff', async ({ page }) => {
		await loadFixture(page, { width: 783, pluginCount: 6, variant: 'dom-only-extra' });

		const state = await page.evaluate(() => {
			const pluginOrder = [
				'wp-admin-bar-wpseo-menu',
				'wp-admin-bar-autoptimize',
				'wp-admin-bar-query-monitor',
				'wp-admin-bar-wpforms-menu',
				'wp-admin-bar-litespeed-menu',
				'wp-admin-bar-updraft_admin_node',
			];
			const classifiedIds = Array.from(document.querySelectorAll('.wp-admin-bar-overflow-classified-plugin-node')).map(
				(el) => el.id
			);
			const inlineIds = pluginOrder.filter(
				(id) => !document.getElementById(id).classList.contains('wp-admin-bar-overflow-hidden-by-overflow')
			);
			const hiddenIds = pluginOrder.filter((id) =>
				document.getElementById(id).classList.contains('wp-admin-bar-overflow-hidden-by-overflow')
			);
			const shownMirrorOriginalIds = Array.from(
				document.querySelectorAll('#wp-admin-bar-overflow-plugins-default > .wp-admin-bar-overflow-mirror-shown')
			).map((el) => el.getAttribute('data-mirror-of'));

			return {
				classifiedIds,
				hiddenIds,
				inlineThenHidden: inlineIds.concat(hiddenIds),
				pluginOrder,
				shownMirrorOriginalIds,
				wooClassified: document
					.getElementById('wp-admin-bar-woocommerce-site-visibility-badge')
					.classList.contains('wp-admin-bar-overflow-classified-plugin-node'),
				wooMirrorExists: !!document.querySelector(
					'#wp-admin-bar-overflow-plugins-default > [data-mirror-of="wp-admin-bar-woocommerce-site-visibility-badge"]'
				),
			};
		});

		expect(state.classifiedIds).toEqual(expect.arrayContaining(['wp-admin-bar-litespeed-menu', 'wp-admin-bar-updraft_admin_node']));
		expect(state.wooClassified).toBe(false);
		expect(state.wooMirrorExists).toBe(false);
		expect(state.hiddenIds).toContain('wp-admin-bar-updraft_admin_node');
		expect(state.shownMirrorOriginalIds[0]).toBe('wp-admin-bar-updraft_admin_node');
		expect(state.shownMirrorOriginalIds.indexOf('wp-admin-bar-updraft_admin_node')).toBeLessThan(
			state.shownMirrorOriginalIds.indexOf('wp-admin-bar-wpforms-menu')
		);
		expect(state.inlineThenHidden).toEqual(state.pluginOrder);
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

	test('S1.32b sizes the mobile trigger like Core admin-bar controls', async ({ page }) => {
		await loadFixture(page, { width: 492, height: 745, pluginCount: 30 });

		const trigger = await page.evaluate(() => {
			const anchor = document.querySelector('#wp-admin-bar-overflow-plugins > a.ab-item');
			const icon = anchor.querySelector(':scope > .ab-icon');
			const rect = anchor.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const iconStyle = getComputedStyle(icon, '::before');
			return {
				width: rect.width,
				height: rect.height,
				iconFontSize: parseFloat(iconStyle.fontSize),
				iconWidth: iconRect.width,
				iconHeight: iconRect.height,
			};
		});

		expect(trigger.width).toBeGreaterThanOrEqual(52);
		expect(trigger.height).toBeGreaterThanOrEqual(46);
		expect(trigger.iconFontSize).toBe(32);
		expect(trigger.iconWidth).toBeGreaterThanOrEqual(52);
		expect(trigger.iconHeight).toBeGreaterThanOrEqual(46);
	});

	test('S1.33 gives icon-only mirrors visible labels and aligned rows', async ({ page }) => {
		await loadFixture(page, { width: 741, height: 745, pluginCount: 12 });
		await page.locator('#wp-admin-bar-overflow-plugins > a.ab-item').click();

		const state = await page.evaluate(() => {
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
			const textLeft = (selector) => {
				const row = document.querySelector(selector);
				const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
					acceptNode(node) {
						return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
					},
				});
				const text = walker.nextNode();
				const range = document.createRange();
				range.selectNodeContents(text);
				const r = range.getBoundingClientRect();
				range.detach();
				return r.left;
			};
			const textOnlyRowLeft = textLeft('#wp-admin-bar-mirror-plugin-3 > a.ab-item');
			const deepAnchor = document.querySelector('#wp-admin-bar-mirror-deep-menu > a.ab-item');
			const deepAnchorRect = deepAnchor.getBoundingClientRect();
			const deepArrowRect = deepAnchor.querySelector('.wp-admin-bar-arrow').getBoundingClientRect();
			const iconToolAnchor = document.querySelector('#wp-admin-bar-mirror-icon-tool > a.ab-item');
			const iconToolLabel = iconToolAnchor.querySelector('.wp-admin-bar-overflow-mirror-label');
			const iconToolIcon = iconToolAnchor.querySelector('.ab-icon.dashicons');
			const iconToolIconRect = iconToolIcon.getBoundingClientRect();
			return {
				yoast: {
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
				},
				deepMenu: {
					textLeftDelta: Math.abs(textLeft('#wp-admin-bar-mirror-deep-menu > a.ab-item') - textOnlyRowLeft),
					arrowRightDelta: Math.abs(deepAnchorRect.right - deepArrowRect.right),
				},
				iconTool: {
					labelText: iconToolLabel.textContent.trim(),
					iconWidth: iconToolIconRect.width,
					iconHeight: iconToolIconRect.height,
					iconColor: getComputedStyle(iconToolIcon).color,
					anchorColor: getComputedStyle(iconToolAnchor).color,
				},
			};
		});

		expect(state.yoast.labelText).toBe('Yoast SEO');
		expect(state.yoast.labelWidth).toBeGreaterThan(40);
		expect(Math.abs(state.yoast.badgeWidth - state.yoast.badgeHeight)).toBeLessThanOrEqual(2);
		expect(state.yoast.iconWidth).toBe(20);
		expect(state.yoast.iconHeight).toBe(20);
		expect(state.yoast.iconBackgroundSize).toBe('20px 20px');
		expect(state.yoast.labelMidDelta).toBeLessThanOrEqual(2);
		expect(state.yoast.badgeMidDelta).toBeLessThanOrEqual(2);
		expect(state.yoast.iconMidDelta).toBeLessThanOrEqual(2);
		expect(state.deepMenu.textLeftDelta).toBeLessThanOrEqual(1);
		expect(state.deepMenu.arrowRightDelta).toBeLessThanOrEqual(12);
		expect(state.iconTool.labelText).toBe('Fixture Icon Tool');
		expect(state.iconTool.iconWidth).toBe(20);
		expect(state.iconTool.iconHeight).toBe(20);
		expect(state.iconTool.iconColor).toBe(state.iconTool.anchorColor);
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

async function loadFixture(page, { width, height = 800, pluginCount, variant = 'default' }) {
	await page.setViewportSize({ width, height });
	await page.setContent(buildFixtureHtml(pluginCount, variant), { waitUntil: 'domcontentloaded' });
	await page.addStyleTag({ content: runtime.css });
	await page.addScriptTag({ content: runtime.js });
	await page.waitForFunction(
		(count) => document.querySelectorAll('.wp-admin-bar-overflow-mirror').length === count,
		pluginCount
	);
	await page.waitForFunction(() => document.body.dataset.wpaboReady === '1');
}

async function visualOverflowState(page) {
	await flushResize(page);
	return page.evaluate(() => {
		const visualOrder = Array.from(document.querySelectorAll('#wp-admin-bar-root-default > .visual-order-node'))
			.map((el) => el.id);
		const inlineIds = visualOrder.filter(
			(id) => !document.getElementById(id).classList.contains('wp-admin-bar-overflow-hidden-by-overflow')
		);
		const hiddenIds = visualOrder.filter((id) =>
			document.getElementById(id).classList.contains('wp-admin-bar-overflow-hidden-by-overflow')
		);
		const shownMirrorOriginalIds = Array.from(
			document.querySelectorAll('#wp-admin-bar-overflow-plugins-default > .wp-admin-bar-overflow-mirror-shown')
		).map((el) => el.getAttribute('data-mirror-of'));
		return {
			visualOrder,
			inlineIds,
			hiddenIds,
			hiddenCount: hiddenIds.length,
			inlineThenHidden: inlineIds.concat(hiddenIds),
			shownMirrorOriginalIds,
		};
	});
}

async function flushResize(page) {
	await page.evaluate(
		() =>
			new Promise((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(resolve));
			})
	);
}

function buildFixtureHtml(pluginCount, variant = 'default') {
	const nodes = buildNavNodes(pluginCount, variant);
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
			${pluginItems(pluginCount, variant)}
		</ul>
		<ul id="wp-admin-bar-top-secondary" class="ab-top-secondary ab-top-menu" role="none">
			<li id="wp-admin-bar-overflow-plugins" class="menupop wp-admin-bar-overflow-trigger" role="none">
				<a class="ab-item" href="#" onclick="return false;" role="menuitem" aria-expanded="false" aria-haspopup="menu">
					<span class="ab-icon" aria-hidden="true"></span>
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
		skipNodeIds:
			variant === 'dom-only-extra' ? ['wp-admin-bar-woocommerce-site-visibility-badge'] : [],
		dropdown: { id: 'overflow-plugins', label: 'Plugins', emptyMessage: '' },
	breakpoints: { narrowDesktop: 1280, tablet: 782, mobile: 600 },
	flags: { debug: false },
})}</script>
<script>requestAnimationFrame(() => { document.body.dataset.wpaboReady = '1'; });</script>
</body>
</html>`;
}

function buildNavNodes(pluginCount, variant = 'default') {
	const coreNodes = buildCoreNavNodes();
	if (variant === 'out-of-order') {
		return coreNodes.concat(outOfOrderPluginIds().map((rawId) => pluginNode(rawId, rawId.replace('fixture-', 'Fixture '), 100)));
	}
	if (variant === 'dom-only-extra') {
		return coreNodes.concat([
			pluginNode('wpseo-menu', 'Yoast SEO', 110),
			pluginNode('autoptimize', 'Autoptimize', 100),
			pluginNode('query-monitor', 'Query Monitor', 100),
			pluginNode('wpforms-menu', 'WPForms', 100),
		]);
	}

	const nodes = coreNodes.concat([
		pluginNode('query-monitor', 'Query Monitor', 10),
		pluginNode('wpseo-menu', 'Yoast SEO', 20),
	]);
	for (let i = 3; i <= pluginCount; i++) {
		const special = specialPlugin(i);
		nodes.push(pluginNode(special.rawId, special.canonical, 20 + i));
	}
	return nodes;
}

function specialPlugin(index) {
	if (index === 4) {
		return { rawId: 'deep-menu', canonical: 'Deep Menu' };
	}
	if (index === 5) {
		return { rawId: 'icon-tool', canonical: 'Fixture Icon Tool' };
	}
	return { rawId: `plugin-${index}`, canonical: `Plugin ${index}` };
}

function buildCoreNavNodes() {
	return [
		coreNode('wp-logo', 'About WordPress'),
		coreNode('site-name', 'Site name'),
		coreNode('edit', 'Edit Site'),
		coreNode('comments', 'Comments'),
		coreNode('new-content', 'New'),
		coreNode('my-account', 'My account', 'top-secondary'),
		coreNode('search', 'Search', 'top-secondary'),
	];
}

function coreNode(rawId, canonical, parent = null) {
	return {
		nodeId: `wp-admin-bar-${rawId}`,
		rawId,
		class: 'core',
		parent: parent ? `wp-admin-bar-${parent}` : null,
		priority: 0,
		labels: { canonical, screen_reader: null },
		icon: { kind: 'none', ref: null },
		badge: { text: null, attention: false },
		href: '#',
		submenuChildren: [],
	};
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

function pluginItems(pluginCount, variant = 'default') {
	if (variant === 'out-of-order') {
		return [
			'fixture-gamma',
			'fixture-alpha',
			'fixture-delta',
			'fixture-beta',
			'fixture-epsilon',
			'fixture-zeta',
		]
			.map(
				(rawId) =>
					`<li id="wp-admin-bar-${rawId}" class="visual-order-node" role="none"><a class="ab-item" href="#" role="menuitem">${rawId.replace('fixture-', 'Fixture ')}</a></li>`
			)
			.join('\n');
	}
	if (variant === 'dom-only-extra') {
		return [
			`<li id="wp-admin-bar-woocommerce-site-visibility-badge" role="none"><a class="ab-item" href="#" role="menuitem">Store coming soon</a></li>`,
			`<li id="wp-admin-bar-wpseo-menu" role="none"><a class="ab-item" href="#" role="menuitem">SEO <span class="wp-ui-notification">4</span></a></li>`,
			`<li id="wp-admin-bar-autoptimize" role="none"><a class="ab-item" href="#" role="menuitem">Autoptimize</a></li>`,
			`<li id="wp-admin-bar-query-monitor" role="none"><a class="ab-item" href="#" role="menuitem">1.26s 153.2MB 0.01s 22Q</a></li>`,
			`<li id="wp-admin-bar-wpforms-menu" role="none"><a class="ab-item" href="#" role="menuitem">WPForms</a></li>`,
			`<li id="wp-admin-bar-litespeed-menu" role="none"><a class="ab-item" href="#" role="menuitem"><span class="ab-icon" title="LiteSpeed Cache"></span></a></li>`,
			`<li id="wp-admin-bar-updraft_admin_node" role="none"><div class="ab-item ab-empty-item" role="menuitem">UpdraftPlus</div></li>`,
		].join('\n');
	}

	const items = [
		`<li id="wp-admin-bar-query-monitor" role="none"><a class="ab-item" href="#" role="menuitem">0.60s 50.6MB 0.00s 4Q</a></li>`,
		`<li id="wp-admin-bar-wpseo-menu" role="none"><a class="ab-item" href="#" role="menuitem"><div id="wp-admin-bar-yoast-ab-icon" class="ab-item yoast-logo svg"><span class="screen-reader-text">SEO</span></div><span class="wp-ui-notification yoast-issue-counter">2</span></a></li>`,
	];
	for (let i = 3; i <= pluginCount; i++) {
		if (i === 4) {
			items.push(
				`<li id="wp-admin-bar-deep-menu" class="menupop" role="none"><a class="ab-item" href="#" role="menuitem"><span class="wp-admin-bar-arrow" aria-hidden="true"></span>Deep Menu</a><div class="ab-sub-wrapper" role="none"><ul class="ab-submenu" role="menu"><li id="wp-admin-bar-deep-child" role="none"><a class="ab-item" href="#" role="menuitem">Deep Child</a></li></ul></div></li>`
			);
			continue;
		}
		if (i === 5) {
			items.push(
				`<li id="wp-admin-bar-icon-tool" role="none"><a class="ab-item" href="#" role="menuitem"><span class="screen-reader-text">Fixture Icon Tool</span><span class="ab-icon dashicons dashicons-admin-tools" aria-hidden="true"></span></a></li>`
			);
			continue;
		}
		items.push(`<li id="wp-admin-bar-plugin-${i}" role="none"><a class="ab-item" href="#" role="menuitem">Plugin ${i}</a></li>`);
	}
	return items.join('\n');
}

function outOfOrderPluginIds() {
	return [
		'fixture-alpha',
		'fixture-beta',
		'fixture-gamma',
		'fixture-delta',
		'fixture-epsilon',
		'fixture-zeta',
	];
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
		#wpadminbar .wp-admin-bar-arrow { color: #a7aaad; display: inline-block; height: 20px; line-height: 20px; margin: 0 8px 0 0; width: 20px; }
		#wpadminbar .wp-admin-bar-arrow::before { content: ">"; position: relative; }
		#wpadminbar .dashicons { color: #72aee6; display: inline-block; font-size: 32px; height: 32px; line-height: 32px; width: 32px; }
		#wpadminbar .dashicons-admin-tools::before { content: "T"; }
		#wpadminbar .visual-order-node { width: 94px; }
		#wpadminbar .visual-order-node > .ab-item { box-sizing: border-box; overflow: hidden; padding: 0 7px; text-overflow: ellipsis; width: 94px; }
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
