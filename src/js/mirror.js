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

export function setupMirror(bar, navModel) {
	const group = document.getElementById(PLACEHOLDER_GROUP_HTML_ID);
	if (!group) return;

	const pluginEntries = (navModel.nodes || []).filter(
		(n) => n && n.class === 'plugin' && n.nodeId
	);
	if (pluginEntries.length === 0) return;

	const fragment = document.createDocumentFragment();
	let injected = 0;
	for (const entry of pluginEntries) {
		const original = document.getElementById(entry.nodeId);
		if (!original) continue;

		const clone = original.cloneNode(true);
		rewriteIdsAndMarkMirror(clone);
		stripRuntimeHideClasses(clone);
		clone.classList.add(MIRROR_CLASS);
		applyIconOnlyLabelTreatment(clone, entry);

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

	const existingLabel = anchor.querySelector('.ab-label');
	if (existingLabel) {
		if (existingLabel.classList.contains('screen-reader-text')) {
			existingLabel.classList.remove('screen-reader-text');
			existingLabel.classList.add(MIRROR_LABEL_CLASS);
		}
		return;
	}

	const canonical = entry && entry.labels && entry.labels.canonical;
	if (!canonical) return;

	const label = document.createElement('span');
	label.className = 'ab-label ' + MIRROR_LABEL_CLASS;
	label.textContent = canonical;
	anchor.appendChild(label);
}
