/**
 * Runtime entry. Reads the inline NavModel JSON, bootstraps the four
 * subsystems (overflow, mirror, click-forward, mutation-sync), and exposes
 * the debug API when `WP_ADMIN_BAR_OVERFLOW_DEBUG` is defined PHP-side.
 *
 * Fast-exit shape: when the page has no plugin-classified nodes (F3 — bare
 * WP), the bootstrap parses the JSON, finds no plugin nodes, and returns
 * before instantiating any observer. The no-op idle cost gate (≤ 0.5 ms
 * on F3 first paint) reads this path.
 */

import { setupOverflow } from './overflow.js';
import { setupMirror } from './mirror.js';
import { setupClickForward } from './click-forward.js';
import { setupMutationSync } from './mutation-sync.js';
import { exposeDebugWhenEnabled } from './debug.js';

(function bootstrap() {
	if (typeof performance !== 'undefined' && performance.mark) {
		try {
			performance.mark('wpabo:start');
		} catch (err) {
			// User Timing is best-effort; survives any UA gap silently.
		}
	}
	const finish = () => {
		if (typeof performance !== 'undefined' && performance.measure) {
			try {
				performance.measure('wpabo:bootstrap', 'wpabo:start');
			} catch (err) {
			// User Timing is best-effort; survives any UA gap silently.
		}
		}
	};

	const dataEl = document.getElementById('wp-admin-bar-overflow-data');
	if (!dataEl) {
		finish();
		return;
	}

	let navModel;
	try {
		navModel = JSON.parse(dataEl.textContent);
	} catch (err) {
		finish();
		return;
	}
	if (!navModel || !navModel.enabled) {
		finish();
		return;
	}

	const bar = document.getElementById('wpadminbar');
	if (!bar) {
		finish();
		return;
	}

	addRuntimePluginEntries(navModel);

	const allNodes = navModel.nodes || [];
	const pluginIds = [];
	for (let i = 0; i < allNodes.length; i++) {
		const node = allNodes[i];
		if (node && node.class === 'plugin' && node.nodeId) {
			pluginIds.push(node.nodeId);
		}
	}
	if (pluginIds.length === 0) {
		finish();
		return;
	}

	// Order matters: mirror clones the pristine originals first, then
	// overflow adds the runtime hide class to the originals. Reversing
	// this order would copy the hide class onto the mirrors and the
	// responsive CSS would hide them inside the dropdown at ≤ 782px.
	setupMirror(bar, navModel);
	setupOverflow(bar, pluginIds, navModel.breakpoints || {});
	setupClickForward(bar);
	setupMutationSync(bar, new Set(pluginIds));

	exposeDebugWhenEnabled(navModel.flags && navModel.flags.debug);
	finish();
})();

function addRuntimePluginEntries(navModel) {
	const nodes = navModel.nodes || [];
	const knownNodeIds = new Set();
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i] && nodes[i].nodeId) {
			knownNodeIds.add(nodes[i].nodeId);
		}
	}
	const skipNodeIds = Array.isArray(navModel.skipNodeIds) ? navModel.skipNodeIds : [];
	for (let i = 0; i < skipNodeIds.length; i++) {
		if (typeof skipNodeIds[i] === 'string') {
			knownNodeIds.add(skipNodeIds[i]);
		}
	}

	const additions = [];
	const parents = [
		document.getElementById('wp-admin-bar-root-default'),
		document.getElementById('wp-admin-bar-top-secondary'),
	];
	for (let i = 0; i < parents.length; i++) {
		const parent = parents[i];
		if (!parent) continue;
		const children = Array.from(parent.children || []);
		for (let j = 0; j < children.length; j++) {
			const child = children[j];
			if (!isRuntimePluginCandidate(child, knownNodeIds)) continue;
			knownNodeIds.add(child.id);
			additions.push(buildRuntimePluginEntry(child, parent));
		}
	}

	if (additions.length > 0) {
		navModel.nodes = nodes.concat(additions);
	}
}

function isRuntimePluginCandidate(el, knownNodeIds) {
	if (!el || !el.id || knownNodeIds.has(el.id)) return false;
	if (!el.id.startsWith('wp-admin-bar-')) return false;
	if (el.id === 'wp-admin-bar-overflow-plugins') return false;
	return true;
}

function buildRuntimePluginEntry(el, parent) {
	const rawId = el.id.slice('wp-admin-bar-'.length);
	return {
		nodeId: el.id,
		rawId,
		class: 'plugin',
		parent: parent && parent.id === 'wp-admin-bar-top-secondary' ? parent.id : null,
		priority: 100,
		labels: {
			canonical: runtimePluginLabel(el, rawId),
			screen_reader: null,
		},
		icon: { kind: 'none', ref: null },
		badge: { text: null, attention: false },
		href: runtimePluginHref(el),
		submenuChildren: Array.from(el.querySelectorAll(':scope > .ab-sub-wrapper > .ab-submenu > li[id]')).map(
			(child) => child.id
		),
	};
}

function runtimePluginLabel(el, rawId) {
	const directItem = el.querySelector(':scope > .ab-item');
	if (directItem) {
		const titleNode = directItem.querySelector('[title]');
		const title = titleNode && titleNode.getAttribute('title');
		if (title) return title;

		const clone = directItem.cloneNode(true);
		const ignored = clone.querySelectorAll('.ab-sub-wrapper, .screen-reader-text, .wp-ui-notification, [aria-hidden="true"]');
		for (let i = 0; i < ignored.length; i++) {
			ignored[i].remove();
		}
		const text = normalizeText(clone.textContent);
		if (text) return text;
	}
	return rawId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function runtimePluginHref(el) {
	const anchor = el.querySelector(':scope > a.ab-item[href]');
	return anchor ? anchor.getAttribute('href') : null;
}

function normalizeText(value) {
	return (value || '').replace(/\s+/g, ' ').trim();
}
