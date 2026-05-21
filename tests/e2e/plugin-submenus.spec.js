/**
 * Issue #4 coverage for plugin admin-bar nodes with nested submenu children.
 */

const { test, expect } = require('@playwright/test');
const { build } = require('esbuild');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const ARROW_RIGHT = '\uf139';
const ARROW_DOWN = '\uf140';
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
	test('S1.38 keeps mobile submenu children collapsed until their parent mirror opens', async ({ page }) => {
		await loadSubmenuFixture(page, { width: 500, height: 360, fillerCount: 4 });
		await openDropdown(page);

		const root = page.locator('#wp-admin-bar-mirror-nested-root-menu');
		const rootAnchor = root.locator('> a.ab-item');
		const clickChild = page.locator('#wp-admin-bar-mirror-nested-click-child > a.ab-item');
		const settingsChild = page.locator('#wp-admin-bar-mirror-nested-settings-child > a.ab-item');
		const settingsGrandchild = page.locator('#wp-admin-bar-mirror-nested-settings-general-child > a.ab-item');
		const hiddenSettingsChild = page.locator('#wp-admin-bar-mirror-nested-upgrade-sidebar-child > a.ab-item');
		const secondaryChild = page.locator('#wp-admin-bar-mirror-secondary-settings-child > a.ab-item');

		await expect(clickChild).toBeHidden();
		await expect(settingsGrandchild).toBeHidden();
		await expect(hiddenSettingsChild).toBeHidden();
		await expect(secondaryChild).toBeHidden();

		await rootAnchor.click();
		await expect(root).toHaveClass(/(^| )hover( |$)/);
		await expect(rootAnchor).toHaveAttribute('aria-expanded', 'true');
		await expect(clickChild).toBeVisible();
		await expect(settingsChild).toBeVisible();
		await expect(settingsGrandchild).toBeHidden();
		await expect(secondaryChild).toBeHidden();

		const state = await page.evaluate(() => {
			const panel = document.querySelector('#wp-admin-bar-overflow-plugins > .ab-sub-wrapper');
			const rootWrapper = document.querySelector('#wp-admin-bar-mirror-nested-root-menu > .ab-sub-wrapper');
			const clickRow = document.querySelector('#wp-admin-bar-mirror-nested-click-child > a.ab-item');
			const iconChildLabel = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .ab-label');
			const iconChildBadge = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .wp-ui-notification');
			const cta = document.querySelector('#wp-admin-bar-mirror-nested-cta-child > .ab-item');
			const ctaLink = document.querySelector('#wp-admin-bar-mirror-nested-cta-child > .ab-item > a');
			const outlineBorder = document.querySelector('#wp-admin-bar-mirror-nested-outline-child .fixture-outline-border');
			const outline = document.querySelector('#wp-admin-bar-mirror-nested-outline-child .fixture-outline-content');
			const arrowState = (selector) => {
				const row = document.querySelector(selector);
				const arrows = row ? row.querySelectorAll(':scope > .wp-admin-bar-arrow') : [];
				const arrow = arrows[0];
				const rowRect = row && row.getBoundingClientRect();
				const arrowRect = arrow && arrow.getBoundingClientRect();
				return {
					count: arrows.length,
					content: arrow ? getComputedStyle(arrow, '::before').content : null,
					rightInset: rowRect && arrowRect ? rowRect.right - arrowRect.right : null,
				};
			};
			const panelRect = panel.getBoundingClientRect();
			const clickRect = clickRow.getBoundingClientRect();
			const labelRect = iconChildLabel.getBoundingClientRect();
			const badgeRect = iconChildBadge.getBoundingClientRect();
			const rootBadgeRect = document
				.querySelector('#wp-admin-bar-mirror-nested-root-menu > .ab-item .wp-ui-notification')
				.getBoundingClientRect();
			const rootArrowRect = document
				.querySelector('#wp-admin-bar-mirror-nested-root-menu > .ab-item > .wp-admin-bar-arrow')
				.getBoundingClientRect();
			const visible = (id) => {
				const el = document.getElementById(id);
				if (!el) return false;
				const rect = el.getBoundingClientRect();
				return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0;
			};

			return {
				rootWrapperDisplay: getComputedStyle(rootWrapper).display,
				rootWrapperPosition: getComputedStyle(rootWrapper).position,
				clickContained:
					clickRect.left >= panelRect.left - 1 &&
					clickRect.right <= panelRect.right + 1 &&
					clickRect.width <= panelRect.width + 1,
				iconChildLabelVisible:
					getComputedStyle(iconChildLabel).position === 'static' &&
					labelRect.width > 40 &&
					labelRect.height > 10,
				iconChildBadgeInset: panelRect.right - badgeRect.right,
				rootChildrenVisible: [
					'wp-admin-bar-mirror-nested-overview-child',
					'wp-admin-bar-mirror-nested-long-child',
					'wp-admin-bar-mirror-nested-badge-child',
					'wp-admin-bar-mirror-nested-settings-child',
					'wp-admin-bar-mirror-nested-cta-child',
					'wp-admin-bar-mirror-nested-outline-child',
					'wp-admin-bar-mirror-nested-click-child',
				].every(visible),
				ctaBackground: getComputedStyle(cta).backgroundColor,
				ctaRadius: getComputedStyle(cta).borderTopLeftRadius,
				ctaHeight: cta.getBoundingClientRect().height,
				ctaWidth: cta.getBoundingClientRect().width,
				outlineBorderWidth: outlineBorder.getBoundingClientRect().width,
				panelWidth: panelRect.width,
				ctaLinkColor: getComputedStyle(ctaLink).color,
				outlineItemDisplay: getComputedStyle(document.querySelector('#wp-admin-bar-mirror-nested-outline-child > .ab-item')).display,
				outlineItemPaddingLeft: getComputedStyle(document.querySelector('#wp-admin-bar-mirror-nested-outline-child > .ab-item')).paddingLeft,
				outlineBackground: getComputedStyle(outline).backgroundColor,
				outlineColor: getComputedStyle(outline).color,
				rootBadgeArrowGap: rootArrowRect.left - rootBadgeRect.right,
				rootArrow: arrowState('#wp-admin-bar-mirror-nested-root-menu > .ab-item'),
				settingsArrow: arrowState('#wp-admin-bar-mirror-nested-settings-child > .ab-item'),
				overviewArrow: arrowState('#wp-admin-bar-mirror-nested-overview-child > .ab-item'),
			};
		});

		expect(state.rootWrapperDisplay).toBe('block');
		expect(state.rootWrapperPosition).toBe('static');
		expect(state.clickContained).toBe(true);
		expect(state.iconChildLabelVisible).toBe(true);
		expect(state.iconChildBadgeInset).toBeGreaterThanOrEqual(18);
		expect(state.rootChildrenVisible).toBe(true);
		expect(state.ctaBackground).toBe('rgb(252, 211, 77)');
		expect(state.ctaRadius).toBe('6px');
		expect(state.ctaHeight).toBe(28);
		expect(state.ctaWidth).toBeLessThan(state.panelWidth - 48);
		expect(Math.abs(state.outlineBorderWidth - state.ctaWidth)).toBeLessThanOrEqual(1);
		expect(state.ctaLinkColor).toBe('rgb(120, 53, 15)');
		expect(state.outlineItemDisplay).toBe('block');
		expect(state.outlineItemPaddingLeft).toBe('12px');
		expect(state.outlineBackground).toBe('rgb(30, 30, 30)');
		expect(state.outlineColor).toBe('rgb(188, 188, 188)');
		expect(state.rootBadgeArrowGap).toBeGreaterThanOrEqual(4);
		expect(state.rootBadgeArrowGap).toBeLessThanOrEqual(8);
		expect(state.rootArrow.count).toBe(1);
		expect(state.rootArrow.content).toContain(ARROW_DOWN);
		expect(state.rootArrow.rightInset).toBeGreaterThanOrEqual(18);
		expect(state.rootArrow.rightInset).toBeLessThanOrEqual(30);
		expect(state.settingsArrow.count).toBe(1);
		expect(state.settingsArrow.content).toContain(ARROW_RIGHT);
		expect(state.settingsArrow.rightInset).toBeGreaterThanOrEqual(18);
		expect(state.settingsArrow.rightInset).toBeLessThanOrEqual(30);
		expect(state.overviewArrow.count).toBe(0);

		await settingsChild.click();
		await expect(root).toHaveClass(/(^| )hover( |$)/);
		await expect(settingsChild).toHaveAttribute('aria-expanded', 'true');
		await expect(settingsGrandchild).toBeVisible();
		await expect(hiddenSettingsChild).toBeHidden();
		await expect(clickChild).toBeVisible();
		const expandedSettingsArrow = await settingsChild.evaluate((row) =>
			getComputedStyle(row.querySelector(':scope > .wp-admin-bar-arrow'), '::before').content
		);
		expect(expandedSettingsArrow).toContain(ARROW_DOWN);

		await page.locator('#wp-admin-bar-mirror-secondary-nested-menu > a.ab-item').click();
		await expect(clickChild).toBeHidden();
		await expect(settingsGrandchild).toBeHidden();
		await expect(secondaryChild).toBeVisible();

		await rootAnchor.click();
		await expect(clickChild).toBeVisible();
		await expect(secondaryChild).toBeHidden();

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

	test('S1.39 opens desktop submenu children as a nested mirror menu', async ({ page }) => {
		await loadSubmenuFixture(page, { width: 820, height: 640, fillerCount: 12 });
		await page.waitForFunction(() => {
			const mirror = document.getElementById('wp-admin-bar-mirror-nested-root-menu');
			return mirror && mirror.classList.contains('wp-admin-bar-overflow-mirror-shown');
		});
		await openDropdown(page);

		const root = page.locator('#wp-admin-bar-mirror-nested-root-menu');
		const rootAnchor = root.locator('> a.ab-item');
		const longChild = page.locator('#wp-admin-bar-mirror-nested-long-child > a.ab-item');
		const settingsChild = page.locator('#wp-admin-bar-mirror-nested-settings-child > a.ab-item');
		const settingsGrandchild = page.locator('#wp-admin-bar-mirror-nested-settings-general-child > a.ab-item');
		const hiddenSettingsChild = page.locator('#wp-admin-bar-mirror-nested-upgrade-sidebar-child > a.ab-item');

		await expect(longChild).toBeHidden();
		await rootAnchor.click();
		await expect(root).toHaveClass(/(^| )hover( |$)/);
		await expect(rootAnchor).toHaveAttribute('aria-expanded', 'true');
		await expect(longChild).toBeVisible();
		await expect(settingsGrandchild).toBeHidden();
		const collapsedSettingsArrow = await settingsChild.evaluate((row) =>
			getComputedStyle(row.querySelector(':scope > .wp-admin-bar-arrow'), '::before').content
		);
		expect(collapsedSettingsArrow).toContain(ARROW_RIGHT);

		await settingsChild.click();
		await expect(root).toHaveClass(/(^| )hover( |$)/);
		await expect(settingsChild).toHaveAttribute('aria-expanded', 'true');
		await expect(settingsGrandchild).toBeVisible();
		await expect(hiddenSettingsChild).toBeHidden();

		const state = await page.evaluate(() => {
			const panel = document.querySelector('#wp-admin-bar-overflow-plugins > .ab-sub-wrapper');
			const submenu = document.querySelector('#wp-admin-bar-mirror-nested-root-menu > .ab-sub-wrapper');
			const mirror = document.getElementById('wp-admin-bar-mirror-nested-root-menu');
			const longChild = document.querySelector('#wp-admin-bar-mirror-nested-long-child > a.ab-item');
			const badge = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .wp-ui-notification');
			const icon = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .dashicons');
			const iconChildLabel = document.querySelector('#wp-admin-bar-mirror-nested-badge-child .ab-label');
			const cta = document.querySelector('#wp-admin-bar-mirror-nested-cta-child > .ab-item');
			const ctaLink = document.querySelector('#wp-admin-bar-mirror-nested-cta-child > .ab-item > a');
			const outline = document.querySelector('#wp-admin-bar-mirror-nested-outline-child .fixture-outline-content');
			const arrowState = (selector) => {
				const row = document.querySelector(selector);
				const arrows = row ? row.querySelectorAll(':scope > .wp-admin-bar-arrow') : [];
				const arrow = arrows[0];
				const rowRect = row && row.getBoundingClientRect();
				const arrowRect = arrow && arrow.getBoundingClientRect();
				return {
					count: arrows.length,
					content: arrow ? getComputedStyle(arrow, '::before').content : null,
					rightInset: rowRect && arrowRect ? rowRect.right - arrowRect.right : null,
				};
			};
			const panelRect = panel.getBoundingClientRect();
			const submenuRect = submenu.getBoundingClientRect();
			const longRect = longChild.getBoundingClientRect();
			const badgeRect = badge.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const labelRect = iconChildLabel.getBoundingClientRect();
			const visible = (selector) => {
				const el = document.querySelector(selector);
				if (!el) return false;
				const rect = el.getBoundingClientRect();
				return getComputedStyle(el).display !== 'none' && rect.width > 0 && rect.height > 0;
			};

			return {
				triggerVisible: getComputedStyle(document.getElementById('wp-admin-bar-overflow-plugins')).display !== 'none',
				mirrorShown: mirror.classList.contains('wp-admin-bar-overflow-mirror-shown'),
				submenuDisplay: getComputedStyle(submenu).display,
				submenuPosition: getComputedStyle(submenu).position,
				nestedFlyout:
					getComputedStyle(submenu).position === 'absolute' &&
					submenuRect.right <= panelRect.left + 1,
				childrenVisible: [
					'#wp-admin-bar-mirror-nested-overview-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-long-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-badge-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-settings-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-settings-general-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-cta-child > .ab-item',
					'#wp-admin-bar-mirror-nested-outline-child > a.ab-item',
					'#wp-admin-bar-mirror-nested-click-child > a.ab-item',
				].every(visible),
				longChildContained:
					longRect.width <= submenuRect.width + 1 &&
					longRect.height > 32,
				badgeAligned: Math.abs(badgeRect.height - 18) <= 1,
				iconAligned: Math.abs(iconRect.width - 18) <= 1 && Math.abs(iconRect.height - 18) <= 1,
				iconChildLabelVisible:
					getComputedStyle(iconChildLabel).position === 'static' &&
					labelRect.width > 40 &&
					labelRect.height > 10,
				ctaBackground: getComputedStyle(cta).backgroundColor,
				ctaRadius: getComputedStyle(cta).borderTopLeftRadius,
				ctaHeight: cta.getBoundingClientRect().height,
				ctaWidth: cta.getBoundingClientRect().width,
				panelWidth: panelRect.width,
				ctaLinkColor: getComputedStyle(ctaLink).color,
				outlineItemDisplay: getComputedStyle(document.querySelector('#wp-admin-bar-mirror-nested-outline-child > .ab-item')).display,
				outlineItemPaddingLeft: getComputedStyle(document.querySelector('#wp-admin-bar-mirror-nested-outline-child > .ab-item')).paddingLeft,
				outlineBackground: getComputedStyle(outline).backgroundColor,
				outlineColor: getComputedStyle(outline).color,
				rootArrow: arrowState('#wp-admin-bar-mirror-nested-root-menu > .ab-item'),
				settingsArrow: arrowState('#wp-admin-bar-mirror-nested-settings-child > .ab-item'),
				overviewArrow: arrowState('#wp-admin-bar-mirror-nested-overview-child > .ab-item'),
			};
		});

		expect(state.triggerVisible).toBe(true);
		expect(state.mirrorShown).toBe(true);
		expect(state.submenuDisplay).toBe('block');
		expect(state.submenuPosition).toBe('absolute');
		expect(state.nestedFlyout).toBe(true);
		expect(state.childrenVisible).toBe(true);
		expect(state.longChildContained).toBe(true);
		expect(state.badgeAligned).toBe(true);
		expect(state.iconAligned).toBe(true);
		expect(state.iconChildLabelVisible).toBe(true);
		expect(state.ctaBackground).toBe('rgb(252, 211, 77)');
		expect(state.ctaRadius).toBe('6px');
		expect(state.ctaHeight).toBe(28);
		expect(state.ctaWidth).toBeLessThan(state.panelWidth - 48);
		expect(state.ctaLinkColor).toBe('rgb(120, 53, 15)');
		expect(state.outlineItemDisplay).toBe('block');
		expect(state.outlineItemPaddingLeft).toBe('12px');
		expect(state.outlineBackground).toBe('rgb(30, 30, 30)');
		expect(state.outlineColor).toBe('rgb(188, 188, 188)');
		expect(state.rootArrow.count).toBe(1);
		expect(state.rootArrow.content).toContain(ARROW_DOWN);
		expect(state.rootArrow.rightInset).toBeGreaterThanOrEqual(10);
		expect(state.rootArrow.rightInset).toBeLessThanOrEqual(22);
		expect(state.settingsArrow.count).toBe(1);
		expect(state.settingsArrow.content).toContain(ARROW_DOWN);
		expect(state.settingsArrow.rightInset).toBeGreaterThanOrEqual(10);
		expect(state.settingsArrow.rightInset).toBeLessThanOrEqual(22);
		expect(state.overviewArrow.count).toBe(0);

		await page.evaluate(() => {
			window.__wpaboNestedChildClicks = 0;
			const original = document.querySelector('#wp-admin-bar-nested-click-child > a.ab-item');
			original.addEventListener('click', (event) => {
				event.preventDefault();
				window.__wpaboNestedChildClicks += 1;
			});
		});

		await page.locator('#wp-admin-bar-mirror-nested-click-child > a.ab-item').click();
		const clicks = await page.evaluate(() => window.__wpaboNestedChildClicks);
		expect(clicks).toBe(1);
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
	const nodes = [
		coreNode('wp-logo', 'WordPress'),
		coreNode('site-name', 'Fixture Site With A Longer Name'),
		coreNode('comments', '0'),
		coreNode('new-content', 'New'),
		coreNode('my-account', 'Howdy, demo', 'top-secondary'),
	];
	for (let i = 1; i <= fillerCount; i++) {
		nodes.push(pluginNode(`filler-${i}`, `Filler Plugin ${i}`, i));
	}
	nodes.push(pluginNode('nested-root-menu', 'Nested Root Menu', 200));
	nodes.push(pluginNode('secondary-nested-menu', 'Secondary Nested Menu', 210, 'top-secondary'));
	return nodes;
}

function coreNode(rawId, canonical, parent = null) {
	return {
		nodeId: `wp-admin-bar-${rawId}`,
		rawId,
		class: 'core',
		parent,
		priority: 0,
		labels: { canonical, screen_reader: null },
		icon: { kind: 'none', ref: null },
		badge: { text: null, attention: false },
		href: '#',
		submenuChildren: [],
	};
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
			<a class="ab-item" href="#nested-root" role="menuitem"><span class="wp-admin-bar-arrow" aria-hidden="true"></span>Nested Root Menu <span class="wp-ui-notification">2</span></a>
			<div class="ab-sub-wrapper" role="none">
				<ul class="ab-submenu" role="menu">
					<li id="wp-admin-bar-nested-overview-child" role="none"><a class="ab-item" href="#nested-overview" role="menuitem"><span class="wp-admin-bar-arrow" aria-hidden="true"></span>Overview</a></li>
					<li id="wp-admin-bar-nested-long-child" role="none"><a class="ab-item" href="#nested-long" role="menuitem">A very long plugin submenu child label that should wrap inside the overflow panel</a></li>
					<li id="wp-admin-bar-nested-badge-child" role="none"><a class="ab-item" href="#nested-badge" role="menuitem"><span class="ab-icon dashicons dashicons-admin-tools" aria-hidden="true"></span><span class="ab-label">Icon child</span> <span class="wp-ui-notification">3</span></a></li>
					<li id="wp-admin-bar-nested-settings-child" class="menupop" role="none">
						<a class="ab-item" href="#nested-settings" role="menuitem">SEO Settings</a>
						<div class="ab-sub-wrapper" role="none">
							<ul class="ab-submenu" role="menu">
								<li id="wp-admin-bar-nested-settings-general-child" role="none"><a class="ab-item" href="#nested-settings-general" role="menuitem">General</a></li>
								<li id="wp-admin-bar-nested-settings-integrations-child" role="none"><a class="ab-item" href="#nested-settings-integrations" role="menuitem">Integrations</a></li>
								<li id="wp-admin-bar-nested-upgrade-sidebar-child" role="none"><a class="ab-item" href="#nested-upgrade-sidebar" role="menuitem">Upgrade</a></li>
							</ul>
						</div>
					</li>
					<li id="wp-admin-bar-nested-cta-child" role="none"><div class="ab-item ab-empty-item" tabindex="0" role="menuitem"><a href="#nested-cta">Upgrade</a></div></li>
					<li id="wp-admin-bar-nested-outline-child" role="none"><a class="ab-item" href="#nested-outline" role="menuitem"><span class="fixture-outline-border"><span class="fixture-outline-content">AI Brand Insights</span></span></a></li>
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
		#wpadminbar .menupop li.hover > .ab-sub-wrapper,
		#wpadminbar .menupop li:hover > .ab-sub-wrapper { display: block; left: 100%; right: auto; top: 0; }
		#wpadminbar .ab-top-secondary .menupop li.hover > .ab-sub-wrapper,
		#wpadminbar .ab-top-secondary .menupop li:hover > .ab-sub-wrapper { left: auto; right: 100%; }
		#wpadminbar .ab-submenu { display: block; float: none; }
		#wpadminbar .ab-submenu li { display: block; float: none; }
		#wpadminbar .ab-submenu .ab-item { height: auto; line-height: 20px; padding: 8px 10px; }
		#wpadminbar .wp-admin-bar-arrow { color: #a7aaad; display: inline-block; height: 20px; line-height: 20px; margin: 0 8px 0 0; width: 20px; }
		#wpadminbar .wp-admin-bar-arrow::before { content: ">"; position: relative; }
		#wpadminbar .dashicons { color: #72aee6; display: inline-block; font-size: 20px; height: 20px; line-height: 20px; width: 20px; }
		#wpadminbar .dashicons-admin-tools::before { content: "T"; }
		#wpadminbar .wp-ui-notification { align-items: center; background: #d63638; border-radius: 12px; color: #fff; display: inline-flex; font-size: 11px; height: 18px; justify-content: center; line-height: 18px; min-width: 18px; }
		#wpadminbar #wp-admin-bar-nested-upgrade-sidebar-child { display: none; }
		#wpadminbar #wp-admin-bar-nested-cta-child,
		#wpadminbar #wp-admin-bar-nested-outline-child { display: flex; }
		#wpadminbar #wp-admin-bar-nested-cta-child > .ab-item { align-items: center; background: #fcd34d; border-radius: 6px; display: flex; height: 16px; justify-content: center; margin: 8px 12px 0; min-height: 0; min-width: 140px; padding: 6px 10px; width: auto; }
		#wpadminbar #wp-admin-bar-nested-cta-child > .ab-item > a { color: #78350f; display: block; padding: 0 10px; }
		#wpadminbar #wp-admin-bar-nested-outline-child > .ab-item { display: block; height: 26px; min-height: 0; padding: 10px 12px 8px; width: auto; }
		#wpadminbar #wp-admin-bar-nested-outline-child .fixture-outline-border { background-image: linear-gradient(90deg, #e879f9, #93c5fd); border-radius: 6px; display: flex; height: 30px; min-height: 0; padding: 1px; width: auto; }
		#wpadminbar #wp-admin-bar-nested-outline-child .fixture-outline-content { background: #1e1e1e; border-radius: 6px; color: #bcbcbc; display: flex; height: 30px; min-height: 0; padding: 0 17.6px; width: 100%; }
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
