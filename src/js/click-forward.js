/**
 * Two click responsibilities live here:
 *
 *   (a) Desktop click-to-toggle on the trigger anchor. Core's
 *       `wp-includes/js/admin-bar.js` does NOT bind desktop click on
 *       `.menupop` items (hoverintent covers desktop hover, Enter via
 *       `toggleHoverIfEnter`, touch via `mobileHover`). We add the missing
 *       binding here: `preventDefault()` + flip `.hover` on the parent
 *       `<li>` + flip `aria-expanded` on the trigger anchor. Matches
 *       Core's mechanism at `wp-includes/js/admin-bar.js:292-345` for
 *       parity.
 *
 *   (b) Delegated click forwarding from mirror items in the dropdown back
 *       to their originals. Real mirror nodes carry `data-mirror-of` with
 *       the original element id; clicking the mirror dispatches a click
 *       on the original. Same pattern as `omnibar.php`'s
 *       `omnibar_forward_mobile_clone_clicks`.
 *
 *   (c) Desktop hover-to-open for nested mirror submenus inside the
 *       overflow dropdown. Core's hoverintent binds at init and never
 *       sees mirrors (inserted at runtime), so without this the only way
 *       to expand a plugin's submenu mirror is a click. Scoped to mirrors
 *       under `#wp-admin-bar-overflow-plugins`. Gated on
 *       `(min-width: 783px) and (hover: hover)` — the same 782 px band
 *       the rest of this plugin treats as the mobile/desktop boundary,
 *       combined with a real-hover-capability check so wide-viewport
 *       touch devices keep tap-to-open. Checked dynamically inside each
 *       event handler so a runtime resize re-evaluates correctly.
 *
 * Bundle cost for (a) is ~250 bytes gzipped, inside Decision 8's 8 KB JS
 * budget (Codex round-5 F2 documented the gap; this module closes it).
 */

const TRIGGER_HTML_ID = 'wp-admin-bar-overflow-plugins';
const HOVER_CLOSE_DELAY_MS = 200;

export function setupClickForward(bar) {
	const trigger = document.getElementById(TRIGGER_HTML_ID);
	if (trigger) {
		const anchor = trigger.querySelector('a');
		if (anchor) {
			anchor.addEventListener('click', function (event) {
				event.preventDefault();
				const isOpen = trigger.classList.contains('hover');
				if (isOpen) {
					trigger.classList.remove('hover');
					anchor.setAttribute('aria-expanded', 'false');
				} else {
					trigger.classList.add('hover');
					anchor.setAttribute('aria-expanded', 'true');
				}
			});
		}
	}

	bar.addEventListener('click', function (event) {
		const target = event.target;
		if (!target || !target.closest) return;
		const mirror = target.closest('[data-mirror-of]');
		if (!mirror) return;

		if (shouldToggleMirrorSubmenu(mirror, target)) {
			event.preventDefault();
			// Wide-viewport hover-capable surfaces get open/close from
			// `setupMirrorHover`. Suppress the click toggle there so the
			// two paths don't fight, but still swallow the click so a
			// hashless `<a>` doesn't navigate.
			if (isDesktopHoverMode()) return;
			toggleMirrorSubmenu(mirror);
			return;
		}

		const originalId = mirror.getAttribute('data-mirror-of');
		if (!originalId) return;
		const original = document.getElementById(originalId);
		if (!original) return;
		event.preventDefault();
		const originalAnchor = original.querySelector('a,button');
		if (originalAnchor) originalAnchor.click();
	});

	setupMirrorHover(bar);
}

function isDesktopHoverMode() {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	if (!window.matchMedia('(min-width: 783px)').matches) return false;
	return window.matchMedia('(hover: hover)').matches;
}

function setupMirrorHover(bar) {
	if (typeof window === 'undefined' || !window.matchMedia) return;

	const closeTimers = new WeakMap();

	function cancelClose(mirror) {
		const timer = closeTimers.get(mirror);
		if (timer) {
			clearTimeout(timer);
			closeTimers.delete(mirror);
		}
	}

	function scheduleClose(mirror) {
		cancelClose(mirror);
		const timer = setTimeout(function () {
			closeTimers.delete(mirror);
			if (!mirror.matches(':hover')) {
				closeMirrorTree(mirror);
			}
		}, HOVER_CLOSE_DELAY_MS);
		closeTimers.set(mirror, timer);
	}

	function resolveHoverableMirror(el) {
		if (!el || !el.closest) return null;
		const mirror = el.closest('[data-mirror-of].menupop');
		if (!mirror) return null;
		if (!mirror.closest('#' + TRIGGER_HTML_ID)) return null;
		if (!directSubmenu(mirror)) return null;
		return mirror;
	}

	bar.addEventListener('mouseover', function (event) {
		if (!isDesktopHoverMode()) return;
		const mirror = resolveHoverableMirror(event.target);
		if (!mirror) return;
		cancelClose(mirror);
		if (mirror.classList.contains('hover')) return;
		closeSiblingMirrorSubmenus(mirror);
		setMirrorSubmenuOpen(mirror, true);
	});

	bar.addEventListener('mouseout', function (event) {
		if (!isDesktopHoverMode()) return;
		const mirror = resolveHoverableMirror(event.target);
		if (!mirror) return;
		const related = event.relatedTarget;
		if (related && mirror.contains(related)) return;
		scheduleClose(mirror);
	});
}

function shouldToggleMirrorSubmenu(mirror, target) {
	const directItem = directMenuItem(mirror);
	if (!directItem || !directItem.contains(target)) return false;
	return Boolean(directSubmenu(mirror));
}

function toggleMirrorSubmenu(mirror) {
	const wasOpen = mirror.classList.contains('hover');
	if (wasOpen) {
		closeMirrorTree(mirror);
		return;
	}

	closeSiblingMirrorSubmenus(mirror);
	setMirrorSubmenuOpen(mirror, true);
}

function closeSiblingMirrorSubmenus(mirror) {
	const parent = mirror.parentElement;
	if (!parent) return;

	const siblings = Array.from(parent.children || []);
	for (let i = 0; i < siblings.length; i++) {
		const sibling = siblings[i];
		if (sibling !== mirror && sibling.matches('[data-mirror-of].menupop.hover')) {
			closeMirrorTree(sibling);
		}
	}
}

function closeMirrorTree(mirror) {
	const openDescendants = mirror.querySelectorAll('[data-mirror-of].menupop.hover');
	for (let i = 0; i < openDescendants.length; i++) {
		setMirrorSubmenuOpen(openDescendants[i], false);
	}
	setMirrorSubmenuOpen(mirror, false);
}

function setMirrorSubmenuOpen(mirror, open) {
	if (open) {
		mirror.classList.add('hover');
	} else {
		mirror.classList.remove('hover');
	}
	const item = directMenuItem(mirror);
	if (item && item.hasAttribute('aria-expanded')) {
		item.setAttribute('aria-expanded', open ? 'true' : 'false');
	}
}

function directMenuItem(mirror) {
	const children = Array.from(mirror.children || []);
	for (let i = 0; i < children.length; i++) {
		if (children[i].matches('a.ab-item, div.ab-item')) {
			return children[i];
		}
	}
	return null;
}

function directSubmenu(mirror) {
	const children = Array.from(mirror.children || []);
	for (let i = 0; i < children.length; i++) {
		if (children[i].matches('.ab-sub-wrapper')) {
			return children[i];
		}
	}
	return null;
}
