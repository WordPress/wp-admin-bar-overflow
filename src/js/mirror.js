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
const ARROW_CLASS = 'wp-admin-bar-arrow';
const PRESERVED_CONTROL_CLASS = 'wp-admin-bar-overflow-preserved-control';
const PRESERVED_VISUAL_CLASS = 'wp-admin-bar-overflow-preserved-visual';
const NON_LABEL_TEXT_SELECTOR = [
	'.screen-reader-text',
	'.wp-ui-notification',
	'.yoast-issue-counter',
	'.yoast-issues-count',
	'.ab-icon',
	'[aria-hidden="true"]',
].join(', ');
const BADGE_SELECTOR = '.wp-ui-notification, .yoast-issue-counter, .yoast-issues-count';
const RUNTIME_HIDE_CLASSES = [
	'wp-admin-bar-overflow-classified-plugin-node',
	'wp-admin-bar-overflow-hidden-by-overflow',
];
const STYLE_PRESERVE_IGNORE_SELECTOR = [
	'.screen-reader-text',
	'.wp-ui-notification',
	'.yoast-issue-counter',
	'.yoast-issues-count',
	'.ab-icon',
	'.dashicons',
	'.wp-admin-bar-arrow',
	'[aria-hidden="true"]',
].join(', ');
const PRESERVED_VISUAL_PROPERTIES = [
	'background-color',
	'background-image',
	'border-top-color',
	'border-top-style',
	'border-top-width',
	'border-right-color',
	'border-right-style',
	'border-right-width',
	'border-bottom-color',
	'border-bottom-style',
	'border-bottom-width',
	'border-left-color',
	'border-left-style',
	'border-left-width',
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-right-radius',
	'border-bottom-left-radius',
	'box-shadow',
	'color',
	'outline-color',
	'outline-style',
	'outline-width',
	'text-decoration-color',
];
const PRESERVED_LAYOUT_PROPERTIES = [
	'align-items',
	'box-sizing',
	'display',
	'flex-basis',
	'flex-grow',
	'flex-shrink',
	'gap',
	'height',
	'justify-content',
	'line-height',
	'margin-top',
	'margin-right',
	'margin-bottom',
	'margin-left',
	'max-height',
	'max-width',
	'min-height',
	'min-width',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'width',
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
	preserveStyledSubmenuItems(clone);
	normalizePreservedControlWidths(clone);
	clone.classList.add(MIRROR_CLASS);
	applyIconOnlyLabelTreatment(clone, entry);
	normalizeMirrorArrows(clone);
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

function preserveStyledSubmenuItems(clone) {
	// Rewriting ids is required, but it breaks plugin CSS scoped to the
	// original ids. For submenu children with plugin-styled controls, copy the
	// original box model along the path to the control and copy the control's
	// own visual styles. Plain rows stay under the overflow menu's normalized
	// row treatment.
	const mirroredItems = Array.from(clone.querySelectorAll('[data-mirror-of]'));
	for (let i = 0; i < mirroredItems.length; i++) {
		const mirroredItem = mirroredItems[i];
		if (mirroredItem === clone) continue;
		const originalId = mirroredItem.getAttribute('data-mirror-of');
		if (!originalId) continue;
		const originalItem = document.getElementById(originalId);
		if (!originalItem) continue;

		// Leaf submenu rows hidden by the plugin should stay hidden in the
		// mirror. Menu parents can be hidden by mobile admin-bar CSS while
		// still being needed as structure for visible children.
		if (isHiddenByOwnStyle(originalItem) && !hasDirectSubmenu(originalItem)) {
			mirroredItem.style.setProperty('display', 'none');
			continue;
		}

		const originalDirectItem = directAdminBarItem(originalItem);
		const mirroredDirectItem = directAdminBarItem(mirroredItem);
		if (!originalDirectItem || !mirroredDirectItem) continue;

		if (preserveStyledElementTree(originalDirectItem, mirroredDirectItem, false)) {
			copyPreservedLayout(originalItem, mirroredItem);
			mirroredItem.classList.add(PRESERVED_CONTROL_CLASS);
		}
	}
}

function directAdminBarItem(item) {
	const children = Array.from(item.children || []);
	for (let i = 0; i < children.length; i++) {
		if (children[i].matches('a.ab-item, div.ab-item')) {
			return children[i];
		}
	}
	return null;
}

function preserveStyledElementTree(originalEl, mirroredEl, inheritedPreserve) {
	if (!originalEl || !mirroredEl || shouldIgnoreStylePreservation(originalEl)) {
		return false;
	}

	const preserveOwnStyle = hasPreservableVisualStyle(originalEl);
	const originalChildren = Array.from(originalEl.children || []);
	const mirroredChildren = Array.from(mirroredEl.children || []);
	let descendantHasPreservedStyle = false;
	for (let i = 0; i < originalChildren.length && i < mirroredChildren.length; i++) {
		descendantHasPreservedStyle =
			preserveStyledElementTree(originalChildren[i], mirroredChildren[i], inheritedPreserve || preserveOwnStyle) ||
			descendantHasPreservedStyle;
	}

	const subtreeHasPreservedStyle = preserveOwnStyle || descendantHasPreservedStyle;
	if (subtreeHasPreservedStyle) {
		copyPreservedLayout(originalEl, mirroredEl);
	}
	if (preserveOwnStyle || inheritedPreserve) {
		copyPreservedVisuals(originalEl, mirroredEl);
	}
	if (preserveOwnStyle) {
		mirroredEl.classList.add(PRESERVED_VISUAL_CLASS);
	}
	return subtreeHasPreservedStyle;
}

function normalizePreservedControlWidths(clone) {
	const submenus = Array.from(clone.querySelectorAll('.ab-submenu'));
	for (let i = 0; i < submenus.length; i++) {
		const controls = Array.from(submenus[i].children || [])
			.filter((child) => child.classList && child.classList.contains(PRESERVED_CONTROL_CLASS))
			.map((child) => outermostPreservedVisual(child))
			.filter(Boolean);
		if (controls.length < 2) continue;

		const targetWidth = controls.reduce((max, control) => {
			const width = inlineOuterWidth(control);
			return width ? Math.max(max, width) : max;
		}, 0);
		if (!targetWidth) continue;

		for (let j = 0; j < controls.length; j++) {
			setInlineOuterWidth(controls[j], targetWidth);
		}
	}
}

function outermostPreservedVisual(item) {
	const directItem = directAdminBarItem(item);
	if (!directItem) return null;
	if (directItem.classList.contains(PRESERVED_VISUAL_CLASS)) {
		return directItem;
	}
	return directItem.querySelector('.' + PRESERVED_VISUAL_CLASS);
}

function inlineOuterWidth(el) {
	const width = parsePixelValue(el.style.getPropertyValue('width')) || parsePixelValue(el.style.getPropertyValue('min-width'));
	if (!width) return null;
	const boxSizing = el.style.getPropertyValue('box-sizing');
	if (boxSizing === 'border-box') {
		return width;
	}
	return width + horizontalInlineBox(el);
}

function setInlineOuterWidth(el, outerWidth) {
	const boxSizing = el.style.getPropertyValue('box-sizing');
	const contentWidth = boxSizing === 'border-box' ? outerWidth : outerWidth - horizontalInlineBox(el);
	if (contentWidth > 0) {
		el.style.setProperty('width', contentWidth.toFixed(3).replace(/\.?0+$/, '') + 'px');
	}
}

function horizontalInlineBox(el) {
	return (
		parsePixelValue(el.style.getPropertyValue('padding-left')) +
		parsePixelValue(el.style.getPropertyValue('padding-right')) +
		parsePixelValue(el.style.getPropertyValue('border-left-width')) +
		parsePixelValue(el.style.getPropertyValue('border-right-width'))
	);
}

function parsePixelValue(value) {
	if (!value || !value.endsWith('px')) return 0;
	const parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function copyPreservedVisuals(originalEl, mirroredEl) {
	const originalStyle = getComputedStyle(originalEl);
	for (let i = 0; i < PRESERVED_VISUAL_PROPERTIES.length; i++) {
		copyComputedProperty(originalStyle, mirroredEl, PRESERVED_VISUAL_PROPERTIES[i]);
	}
}

function copyPreservedLayout(originalEl, mirroredEl) {
	const originalStyle = getComputedStyle(originalEl);
	for (let i = 0; i < PRESERVED_LAYOUT_PROPERTIES.length; i++) {
		copyComputedProperty(originalStyle, mirroredEl, PRESERVED_LAYOUT_PROPERTIES[i]);
	}
}

function copyComputedProperty(computedStyle, el, property) {
	const value = computedStyle.getPropertyValue(property);
	if (value) {
		el.style.setProperty(property, value);
	}
}

function shouldIgnoreStylePreservation(el) {
	return el.matches(STYLE_PRESERVE_IGNORE_SELECTOR);
}

function isHiddenByOwnStyle(el) {
	const style = getComputedStyle(el);
	return style.getPropertyValue('display') === 'none' || style.getPropertyValue('visibility') === 'hidden';
}

function hasPreservableVisualStyle(el) {
	if (shouldIgnoreStylePreservation(el)) return false;
	const style = getComputedStyle(el);
	if (!isTransparent(style.getPropertyValue('background-color'))) return true;
	if (style.getPropertyValue('background-image') !== 'none') return true;
	if (style.getPropertyValue('box-shadow') !== 'none') return true;
	if (hasVisibleOutline(style)) return true;
	if (hasVisibleBorder(style)) return true;
	return hasNonZeroRadius(style);
}

function hasVisibleBorder(style) {
	const sides = ['top', 'right', 'bottom', 'left'];
	for (let i = 0; i < sides.length; i++) {
		const side = sides[i];
		const width = parseFloat(style.getPropertyValue('border-' + side + '-width')) || 0;
		const borderStyle = style.getPropertyValue('border-' + side + '-style');
		if (width > 0 && borderStyle !== 'none' && borderStyle !== 'hidden') {
			return true;
		}
	}
	return false;
}

function hasVisibleOutline(style) {
	const width = parseFloat(style.getPropertyValue('outline-width')) || 0;
	const outlineStyle = style.getPropertyValue('outline-style');
	return width > 0 && outlineStyle !== 'none' && outlineStyle !== 'hidden';
}

function hasNonZeroRadius(style) {
	const corners = [
		'border-top-left-radius',
		'border-top-right-radius',
		'border-bottom-right-radius',
		'border-bottom-left-radius',
	];
	for (let i = 0; i < corners.length; i++) {
		if (parseFloat(style.getPropertyValue(corners[i])) > 0) {
			return true;
		}
	}
	return false;
}

function isTransparent(value) {
	const normalized = (value || '').replace(/\s+/g, '').toLowerCase();
	return !normalized || normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
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

function normalizeMirrorArrows(clone) {
	const items = [clone].concat(Array.from(clone.querySelectorAll('li')));
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const directItem = directAdminBarItem(item);
		if (!directItem) continue;

		const arrows = Array.from(directItem.children || []).filter((child) =>
			child.classList && child.classList.contains(ARROW_CLASS)
		);
		const hasSubmenu = hasDirectSubmenu(item);
		if (!hasSubmenu) {
			item.classList.remove('wp-admin-bar-overflow-has-badge');
			for (let j = 0; j < arrows.length; j++) {
				arrows[j].remove();
			}
			continue;
		}
		item.classList.toggle('wp-admin-bar-overflow-has-badge', Boolean(directItem.querySelector(BADGE_SELECTOR)));

		const arrow = arrows[0] || document.createElement('span');
		arrow.classList.add(ARROW_CLASS);
		arrow.setAttribute('aria-hidden', 'true');
		if (!arrow.parentNode) {
			directItem.insertBefore(arrow, directItem.firstChild);
		}
		for (let j = 1; j < arrows.length; j++) {
			arrows[j].remove();
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
