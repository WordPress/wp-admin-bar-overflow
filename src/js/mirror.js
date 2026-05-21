/**
 * Mirror cloning.
 *
 * For each classified plugin original on first paint:
 *
 *   - Deep-clone the `<li>` subtree.
 *   - Rewrite ids: every descendant id starting with `wp-admin-bar-` is
 *     prefixed `wp-admin-bar-mirror-…` so clones never collide with the
 *     originals' ids. Each cloned `<li>` also carries `data-mirror-of`
 *     pointing at its original's id — `click-forward.js` uses the
 *     nearest `[data-mirror-of]` ancestor of the click target to find
 *     the original to forward to, so deep clones with nested submenus
 *     forward at the correct level.
 *   - Strip the runtime hide classes added by `overflow.js` so the
 *     mirror inside the dropdown stays visible regardless of viewport.
 *   - Apply Lucas's icon-only-node treatment per
 *     https://radicalupdates.wordpress.com/2026/05/11/allowing-plugins-on-every-screen-size-and-device-in-the-omnibar/#comment-2654:
 *     if the anchor has an icon and no visible label, inject one using
 *     the classifier's `labels.canonical`.
 *
 * The placeholder child (`#wp-admin-bar-overflow-placeholder`) is
 * removed before the first real mirror lands so the dropdown only ever
 * holds real entries.
 *
 * Mirrors are initially appended in the nav-model's priority order. The
 * overflow runtime reorders shown mirrors by measured visual cutoff order
 * when only part of the plugin set fits.
 *
 * `mutation-sync.js` reuses `buildMirror()` to refresh a mirror in place
 * when its original mutates (text / class / aria changes).
 */

const PLACEHOLDER_GROUP_HTML_ID = 'wp-admin-bar-overflow-plugins-default';
const PLACEHOLDER_NODE_HTML_ID = 'wp-admin-bar-overflow-placeholder';
const MIRROR_PREFIX = 'wp-admin-bar-mirror-';
const ORIGINAL_PREFIX = 'wp-admin-bar-';
const MIRROR_CLASS = 'wp-admin-bar-overflow-mirror';
const MIRROR_LABEL_CLASS = 'wp-admin-bar-overflow-mirror-label';
const NON_LABEL_TEXT_SELECTOR = [
	'.screen-reader-text',
	'.wp-ui-notification',
	'.yoast-issue-counter',
	'.yoast-issues-count',
	'.ab-icon',
	'[aria-hidden="true"]',
].join(', ');
const RUNTIME_HIDE_CLASSES = [
	'wp-admin-bar-overflow-classified-plugin-node',
	'wp-admin-bar-overflow-hidden-by-overflow',
];

let pluginEntriesByNodeId = null;

export function setupMirror(bar, navModel) {
	const group = document.getElementById(PLACEHOLDER_GROUP_HTML_ID);
	if (!group) return;

	const pluginEntries = (navModel.nodes || []).filter(
		(n) => n && n.class === 'plugin' && n.nodeId
	);
	if (pluginEntries.length === 0) return;

	pluginEntriesByNodeId = new Map(pluginEntries.map((entry) => [entry.nodeId, entry]));

	const fragment = document.createDocumentFragment();
	let injected = 0;
	for (const entry of pluginEntries) {
		const original = document.getElementById(entry.nodeId);
		if (!original) continue;
		const clone = buildMirror(original, entry);
		fragment.appendChild(clone);
		injected += 1;
	}

	if (injected === 0) return;

	const placeholder = document.getElementById(PLACEHOLDER_NODE_HTML_ID);
	if (placeholder && placeholder.parentNode) {
		placeholder.parentNode.removeChild(placeholder);
	}
	group.appendChild(fragment);
}

/**
 * Look up the nav-model entry for an original id. Returns null when the
 * original is not in the plugin set (e.g., the mutation observer caught a
 * Core-node change). Reused by mutation-sync's refresh path.
 */
export function getPluginEntry(originalNodeId) {
	if (!pluginEntriesByNodeId) return null;
	return pluginEntriesByNodeId.get(originalNodeId) || null;
}

/**
 * Build a mirror element from the original. Used by `setupMirror` on first
 * paint and by `mutation-sync.js` when re-cloning a mirror after the
 * original mutates. The returned element is not yet in the DOM.
 */
export function buildMirror(original, entry) {
	const clone = original.cloneNode(true);
	rewriteIdsAndMarkMirror(clone);
	stripRuntimeHideClasses(clone);
	clone.classList.add(MIRROR_CLASS);
	applyIconOnlyLabelTreatment(clone, entry);
	normalizeMirrorRoles(clone);
	return clone;
}

function rewriteIdsAndMarkMirror(clone) {
	const elements = [clone].concat(Array.from(clone.querySelectorAll('[id]')));
	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];
		const oid = el.id;
		if (!oid || !oid.startsWith(ORIGINAL_PREFIX)) continue;
		const mirrorId = MIRROR_PREFIX + oid.slice(ORIGINAL_PREFIX.length);
		el.id = mirrorId;
		if (el.tagName === 'LI') {
			el.setAttribute('data-mirror-of', oid);
		}
	}
}

function stripRuntimeHideClasses(clone) {
	const all = [clone].concat(Array.from(clone.querySelectorAll('.' + RUNTIME_HIDE_CLASSES.join(', .'))));
	for (let i = 0; i < all.length; i++) {
		for (let j = 0; j < RUNTIME_HIDE_CLASSES.length; j++) {
			all[i].classList.remove(RUNTIME_HIDE_CLASSES[j]);
		}
	}
}

function normalizeMirrorRoles(clone) {
	const items = [clone].concat(Array.from(clone.querySelectorAll('li')));
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		item.setAttribute('role', 'none');
		const directItem = Array.from(item.children).find((child) => child.matches('a.ab-item, div.ab-item'));
		if (directItem && !directItem.hasAttribute('role')) {
			directItem.setAttribute('role', 'menuitem');
		}
		if (directItem && hasDirectSubmenu(item)) {
			if (!directItem.hasAttribute('aria-haspopup')) {
				directItem.setAttribute('aria-haspopup', 'menu');
			}
			if (!directItem.hasAttribute('aria-expanded')) {
				directItem.setAttribute('aria-expanded', 'false');
			}
		}
	}
}

function hasDirectSubmenu(item) {
	const children = Array.from(item.children || []);
	for (let i = 0; i < children.length; i++) {
		if (children[i].matches('.ab-sub-wrapper')) {
			return true;
		}
	}
	return false;
}

function applyIconOnlyLabelTreatment(clone, entry) {
	const anchor = clone.querySelector(':scope > a.ab-item, :scope > div.ab-item');
	if (!anchor) return;

	const labels = Array.from(anchor.querySelectorAll('.ab-label'));
	const visibleLabel = labels.find(
		(l) => !l.classList.contains('screen-reader-text') && normalizeText(l.textContent)
	);
	if (visibleLabel || hasVisibleLabelText(anchor)) return;

	const canonical = entry && entry.labels && entry.labels.canonical;
	if (!canonical || anchor.querySelector('.' + MIRROR_LABEL_CLASS)) {
		return;
	}

	const label = document.createElement('span');
	label.className = 'ab-label ' + MIRROR_LABEL_CLASS;
	label.textContent = canonical;
	const badge = anchor.querySelector('.wp-ui-notification, .yoast-issue-counter, .yoast-issues-count');
	anchor.insertBefore(label, badge || null);
}

function hasVisibleLabelText(anchor) {
	const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const text = normalizeText(node.nodeValue);
			if (!text) return NodeFilter.FILTER_REJECT;
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_REJECT;
			if (parent.closest(NON_LABEL_TEXT_SELECTOR)) return NodeFilter.FILTER_REJECT;
			if (isHiddenByMarkup(parent, anchor)) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});
	return Boolean(walker.nextNode());
}

function isHiddenByMarkup(el, stopAt) {
	let cursor = el;
	while (cursor && cursor !== stopAt.parentElement) {
		if (cursor.hasAttribute('hidden')) return true;
		if (cursor.getAttribute('aria-hidden') === 'true') return true;
		if (cursor.classList && cursor.classList.contains('screen-reader-text')) return true;
		if (cursor.style && (cursor.style.display === 'none' || cursor.style.visibility === 'hidden')) return true;
		if (cursor === stopAt) return false;
		cursor = cursor.parentElement;
	}
	return false;
}

function normalizeText(text) {
	return (text || '').replace(/\s+/g, ' ').trim();
}
