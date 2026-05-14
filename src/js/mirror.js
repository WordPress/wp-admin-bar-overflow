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
 *     https://radicalupdates.wordpress.com/2026/05/11/allowing-plugins-on-every-screen-size-and-device-in-the-omnibar/#comment-2654 —
 *     if the anchor has an icon and no visible label, inject one using
 *     the classifier's `labels.canonical`. If the label exists but is
 *     `screen-reader-text`-only, make it visible by dropping that class.
 *
 * The placeholder child (`#wp-admin-bar-overflow-placeholder`) is
 * removed before the first real mirror lands so the dropdown only ever
 * holds real entries.
 *
 * Mirrors are appended in the nav-model's priority order; the classifier
 * is the single source of truth for that order.
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
	// The mirror `<li>` is a direct child of `<ul role="menu">` (Core's
	// `_render_group` emits `role="menu"` on the submenu UL). A bare
	// `<li>` carries an implicit `listitem` role, which is not one of
	// `menu`'s allowed children — axe flags it. `role="none"` makes the
	// `<li>` transparent so the `<a role="menuitem">` inside is the
	// effective child.
	clone.setAttribute('role', 'none');
	// Some plugins do not stamp `role="menuitem"` on their admin-bar
	// anchor (Query Monitor for example). When `<li role="none">`
	// passes through, the next effective child is the `<a>` itself —
	// it must carry `role="menuitem"` or axe flags `aria-required-children`
	// on the enclosing `<ul role="menu">`.
	const mirrorAnchor = clone.querySelector(':scope > a.ab-item');
	if (mirrorAnchor && !mirrorAnchor.hasAttribute('role')) {
		mirrorAnchor.setAttribute('role', 'menuitem');
	}
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

function applyIconOnlyLabelTreatment(clone, entry) {
	const anchor = clone.querySelector(':scope > a.ab-item, :scope > div.ab-item');
	if (!anchor) return;

	const labels = Array.from(anchor.querySelectorAll('.ab-label'));
	const visibleLabel = labels.find((l) => !l.classList.contains('screen-reader-text'));
	if (visibleLabel) return;

	const srOnlyLabel = labels.find((l) => l.classList.contains('screen-reader-text'));
	if (srOnlyLabel) {
		srOnlyLabel.classList.remove('screen-reader-text');
		srOnlyLabel.classList.add(MIRROR_LABEL_CLASS);
		return;
	}

	// No `.ab-label` at all. If the anchor already carries any text
	// content (direct or in nested spans / divs), trust the plugin's
	// rendering and leave it alone. Truly icon-only anchors (with the
	// glyph as a background image or pure-SVG) have an empty
	// `textContent` and pick up the canonical label here.
	const fullText = anchor.textContent.replace(/\s+/g, ' ').trim();
	if (fullText) return;

	const canonical = entry && entry.labels && entry.labels.canonical;
	if (!canonical) return;

	const label = document.createElement('span');
	label.className = 'ab-label ' + MIRROR_LABEL_CLASS;
	label.textContent = canonical;
	anchor.appendChild(label);
}
