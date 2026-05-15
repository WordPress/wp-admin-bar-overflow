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
 * Bundle cost for (a) is ~250 bytes gzipped, inside Decision 8's 8 KB JS
 * budget (Codex round-5 F2 documented the gap; this module closes it).
 */

const TRIGGER_HTML_ID = 'wp-admin-bar-overflow-plugins';

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
		const originalId = mirror.getAttribute('data-mirror-of');
		if (!originalId) return;
		const original = document.getElementById(originalId);
		if (!original) return;
		event.preventDefault();
		const originalAnchor = original.querySelector('a,button');
		if (originalAnchor) originalAnchor.click();
	});
}
