/**
 * Issue #4 coverage for plugin admin-bar nodes with nested submenu children.
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

test.describe('plugin submenu mirrors', () => {
	test('S1.38 renders submenu children as contained mobile rows and forwards child clicks', async ({ page }) => {
		await loadSubmenuFixture(page, { width: 500, height: 360, fillerCount: 18 });
		await openDropdown(page);

		const clickChild = page.locator('#wp-admin-bar-mirror-nested-click-child > a.ab-item');
		await clickChild.scrollIntoViewIfNeeded();
		await clickChild.focus();

		const state = await page.evaluate(() => {
			const panel = document.querySelector('#wp-admin-bar-overflow-plugins > .ab-sub-wrapper');
			const rootWrapper = document.querySelector('#wp-admin-bar-mirror-nested-root-menu > .ab-sub-wrapper');
			const clickRow = document.querySelector('#wp-admin-bar-mirror-nested-click-child > a.ab-item');
			const panelRect = panel.getBoundingClientRect();
			const clickRect = clickRow.getBoundingClientRect();
			const visible = (id) => {
				const el = document.getElementById(id);
				if (!el) return false;
				const rect = el.getBoundingClientRect();
				return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0;
			};

			return {
				activeClickChild: document.activeElement === clickRow,
				panelScrollable: panel.scrollHeight > panel.clientHeight,
				rootWrapperDisplay: getComputedStyle(rootWrapper).display,
				rootWrapperPosition: getComputedStyle(rootWrapper).position,
				clickContained:
					clickRect.left >= panelRect.left - 1 &&
					clickRect.right <= panelRect.right + 1 &&
					clickRect.width <= panelRect.width + 1,
				rootChildrenVisible: [
					'wp-admin-bar-mirror-nested-overview-child',
					'wp-admin-bar-mirror-nested-long-child',
					'wp-admin-bar-mirror-nested-badge-child',
					'wp-admin-bar-mirror-nested-click-child',
				].every(visible),
				secondaryChildrenVisible: [
					'wp-admin-bar-mirror-secondary-settings-child',
					'wp-admin-bar-mirror-secondary-report-child',
				].every(visible),
			};
		});

		expect(state.activeClickChild).toBe(true);
		expect(state.panelScrollable).toBe(true);
		expect(state.rootWrapperDisplay).toBe('block');
		expect(state.rootWrapperPosition).toBe('static');
		expect(state.clickContained).toBe(true);
		expect(state.rootChildrenVisible).toBe(true);
		expect(state.secondaryChildrenVisible).toBe(true);

		await page.evaluate(() => {
			window.__wpaboNestedChildClicks = 0;
			const original = document.querySelector('#wp-admin-bar-nested-click-child > a.ab-item');
			original.addEventListener('click', (event) => {
				event.preventDefault();
				window.__wpaboNestedChildClicks += 1;
			});
		});

		await clickChild.click();
		const clicks = await page.evaluate(() => window.__wpaboNestedChildClicks);
		expect(clicks).toBe(1);
	});

	test('S1.39 renders submenu children for an overflowed narrow-desktop mirror', async ({ page }) => {
		await loadSubmenuFixture(page, { width: 820, height: 640, fillerCount: 24 });
		await page.waitForFunction(() => {
			const mirror = document.getElementById('wp-admin-bar-mirror-nested-root-menu');
			return mirror && mirror.classList.contains('wp-admin-bar-overflow-mirror-shown');
		});
		await openDropdown(page);

		const state = await page.evaluate(() => {
			const panel = document.querySelector('#wp-admin-bar-overflow-plugins > .ab-sub-wrapper');
			const mirror = document.getElementById('wp-admin-bar-mirror-nested-root-menu');
			const longChild = document.querySelector('#wp-admin-bar-mirror-nested-long-child > a.ab-item');
			const badge = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .wp-ui-notification');
			const icon = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .dashicons');
			const panelRect = panel.getBoundingClientRect();
			const longRect = longChild.getBoundingClientRect();
			const badgeRect = badge.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const visible = (selector) => {
				const el = document.querySelector(selector);
				if (!el) return false;
				const rect = el.getBoundingClientRect();
				return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0;
			};

			return {
				triggerVisible: getComputedStyle(document.getElementById('wp-admin-bar-overflow-plugins')).display !== 'none',
				mirrorShown: mirror.classList.contains('wp-admin-bar-overflow-mirror-shown'),
				childrenVisible: [
					'#wp-admin-bar-mirror-nested-overview-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-long-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-badge-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-click-child > a.ab-item',
				].every(visible),
				longChildContained:
					longRect.left >= panelRect.left - 1 &&
					longRect.right <= panelRect.right + 1 &&
					longChild.scrollWidth <= longChild.clientWidth + 1,
				badgeAligned: Math.abs(badgeRect.height - 18) <= 1,
				iconAligned: Math.abs(iconRect.width - 18) <= 1 && Math.abs(iconRect.height - 18) <= 1,
			};
		});

		expect(state.triggerVisible).toBe(true);
		expect(state.mirrorShown).toBe(true);
		expect(state.childrenVisible).toBe(true);
		expect(state.longChildContained).toBe(true);
		expect(state.badgeAligned).toBe(true);
		expect(state.iconAligned).toBe(true);
	});
});

async function loadSubmenuFixture(page, { width, height, fillerCount }) {
	await page.setViewportSize({ width, height });
	await page.setContent(buildFixtureHtml(fillerCount), { waitUntil: 'domcontentloaded' });
	await page.addStyleTag({ content: runtime.css });
	await page.addScriptTag({ content: runtime.js });
	await page.waitForFunction(
		(count) => document.querySelectorAll('.wp-admin-bar-overflow-mirror').length === count,
		fillerCount + 2
	);
}

async function openDropdown(page) {
	const anchor = page.locator('#wp-admin-bar-overflow-plugins > a.ab-item');
	await anchor.click();
	await expect(anchor).toHaveAttribute('aria-expanded', 'true');
}

function buildFixtureHtml(fillerCount) {
	const nodes = buildNavNodes(fillerCount);
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Plugin submenu fixture</title>
	<style>${coreAdminBarCss()}</style>
</head>
<body>
<div id="wpadminbar" role="navigation" aria-label="Toolbar">
	<div id="wp-toolbar" role="menubar" aria-label="Top Toolbar">
		<ul id="wp-admin-bar-root-default" class="ab-top-menu" role="none">
			<li id="wp-admin-bar-wp-logo" role="none"><a class="ab-item" href="#" role="menuitem">W</a></li>
			<li id="wp-admin-bar-site-name" role="none"><a class="ab-item" href="#" role="menuitem">Fixture Site With A Longer Name</a></li>
			<li id="wp-admin-bar-comments" role="none"><a class="ab-item" href="#" role="menuitem">0</a></li>
			<li id="wp-admin-bar-new-content" role="none"><a class="ab-item" href="#" role="menuitem">New</a></li>
			${fillerPluginItems(fillerCount)}
			${nestedRootItem()}
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
			${secondaryNestedItem()}
			<li id="wp-admin-bar-my-account" role="none"><a class="ab-item" href="#" role="menuitem">Howdy, demo</a></li>
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
</body>
</html>`;
}

function buildNavNodes(fillerCount) {
	const nodes = [];
	for (let i = 1; i <= fillerCount; i++) {
		nodes.push(pluginNode(`filler-${i}`, `Filler Plugin ${i}`, i));
	}
	nodes.push(pluginNode('nested-root-menu', 'Nested Root Menu', 200));
	nodes.push(pluginNode('secondary-nested-menu', 'Secondary Nested Menu', 210, 'top-secondary'));
	return nodes;
}

function pluginNode(rawId, canonical, priority, parent = null) {
	return {
		nodeId: `wp-admin-bar-${rawId}`,
		rawId,
		class: 'plugin',
		parent,
		priority,
		labels: { canonical, screen_reader: null },
		icon: { kind: 'none', ref: null },
		badge: { text: null, attention: false },
		href: '#',
		submenuChildren: [],
	};
}

function fillerPluginItems(count) {
	let html = '';
	for (let i = 1; i <= count; i++) {
		html += `<li id="wp-admin-bar-filler-${i}" role="none"><a class="ab-item" href="#" role="menuitem">Filler Plugin ${i}</a></li>\n`;
	}
	return html;
}

function nestedRootItem() {
	return `
		<li id="wp-admin-bar-nested-root-menu" class="menupop" role="none">
			<a class="ab-item" href="#nested-root" role="menuitem"><span class="wp-admin-bar-arrow" aria-hidden="true"></span>Nested Root Menu</a>
			<div class="ab-sub-wrapper" role="none">
				<ul class="ab-submenu" role="menu">
					<li id="wp-admin-bar-nested-overview-child" role="none"><a class="ab-item" href="#nested-overview" role="menuitem">Overview</a></li>
					<li id="wp-admin-bar-nested-long-child" role="none"><a class="ab-item" href="#nested-long" role="menuitem">A very long plugin submenu child label that should wrap inside the overflow panel</a></li>
					<li id="wp-admin-bar-nested-badge-child" role="none"><a class="ab-item" href="#nested-badge" role="menuitem"><span class="ab-icon dashicons dashicons-admin-tools" aria-hidden="true"></span>Icon child <span class="wp-ui-notification">3</span></a></li>
					<li id="wp-admin-bar-nested-click-child" role="none"><a class="ab-item" href="#nested-click" role="menuitem">Clickable child</a></li>
				</ul>
			</div>
		</li>
	`;
}

function secondaryNestedItem() {
	return `
		<li id="wp-admin-bar-secondary-nested-menu" class="menupop" role="none">
			<a class="ab-item" href="#secondary-root" role="menuitem"><span class="wp-admin-bar-arrow" aria-hidden="true"></span>Secondary Menu</a>
			<div class="ab-sub-wrapper" role="none">
				<ul class="ab-submenu" role="menu">
					<li id="wp-admin-bar-secondary-settings-child" role="none"><a class="ab-item" href="#secondary-settings" role="menuitem">Settings</a></li>
					<li id="wp-admin-bar-secondary-report-child" role="none"><a class="ab-item" href="#secondary-report" role="menuitem">Report Export</a></li>
				</ul>
			</div>
		</li>
	`;
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
		#wpadminbar .ab-sub-wrapper { background: #2c3338; box-shadow: 0 3px 5px rgba(0, 0, 0, .25); display: none; min-width: 220px; position: absolute; right: 0; top: 32px; }
		#wpadminbar .menupop.hover > .ab-sub-wrapper { display: block; }
		#wpadminbar .ab-submenu { display: block; float: none; }
		#wpadminbar .ab-submenu li { display: block; float: none; }
		#wpadminbar .ab-submenu .ab-item { height: auto; line-height: 20px; padding: 8px 10px; }
		#wpadminbar .wp-admin-bar-arrow { color: #a7aaad; display: inline-block; height: 20px; line-height: 20px; margin: 0 8px 0 0; width: 20px; }
		#wpadminbar .wp-admin-bar-arrow::before { content: ">"; position: relative; }
		#wpadminbar .dashicons { color: #72aee6; display: inline-block; font-size: 20px; height: 20px; line-height: 20px; width: 20px; }
		#wpadminbar .dashicons-admin-tools::before { content: "T"; }
		#wpadminbar .wp-ui-notification { align-items: center; background: #d63638; border-radius: 12px; color: #fff; display: inline-flex; font-size: 11px; height: 18px; justify-content: center; line-height: 18px; min-width: 18px; }
		.screen-reader-text { border: 0; clip: rect(1px, 1px, 1px, 1px); clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; word-wrap: normal !important; }
		@media (max-width: 782px) {
			body { padding-top: 46px; }
			#wpadminbar { font-size: 14px; height: 46px; line-height: 46px; }
			#wpadminbar .ab-item { height: 46px; line-height: 46px; }
			#wpadminbar .ab-sub-wrapper { top: 46px; }
			#wpadminbar .ab-submenu .ab-item { height: auto; line-height: 20px; }
		}
	`;
}
