/**
 * ResizeObserver-driven priority-ordered overflow.
 *
 * On startup the module marks every classified-as-plugin original with the
 * `wp-admin-bar-overflow-classified-plugin-node` class so the responsive
 * stylesheet's `@media (max-width: 782px)` rule can hide all of them at
 * tablet + mobile bands. Between 783px and 1279px the ResizeObserver
 * decides per-node which originals still fit; the rest get the
 * `wp-admin-bar-overflow-hidden-by-overflow` class. The mirror cloning is
 * a separate concern (A.1 work item 3).
 */

import { recordResizeCallback } from './debug.js';

const CLASSIFIED_CLASS = 'wp-admin-bar-overflow-classified-plugin-node';
const OVERFLOW_CLASS = 'wp-admin-bar-overflow-hidden-by-overflow';
const MIRROR_SHOWN_CLASS = 'wp-admin-bar-overflow-mirror-shown';
const ORIGINAL_PREFIX = 'wp-admin-bar-';
const MIRROR_PREFIX = 'wp-admin-bar-mirror-';
const TRIGGER_RESERVE_PX = 80;
const NARROW_DESKTOP_MAX = 1279;

let resizeObserver = null;
let entries = [];
let bar = null;
let tabletPx = 782;

export function setupOverflow(barEl, classifiedPluginIds, breakpoints) {
	bar = barEl;
	if (breakpoints && typeof breakpoints.tablet === 'number') {
		tabletPx = breakpoints.tablet;
	}

	entries = [];
	for (let i = 0; i < classifiedPluginIds.length; i++) {
		const el = document.getElementById(classifiedPluginIds[i]);
		if (!el) continue;
		el.classList.add(CLASSIFIED_CLASS);
		entries.push({ id: classifiedPluginIds[i], el, width: el.offsetWidth });
	}

	if (typeof ResizeObserver === 'undefined') return;

	resizeObserver = new ResizeObserver((roEntries) => {
		const start = performance.now();
		try {
			const width =
				(roEntries && roEntries[0] && roEntries[0].contentRect && roEntries[0].contentRect.width) ||
				bar.offsetWidth;
			applyOverflowPolicy(width);
		} finally {
			recordResizeCallback(performance.now() - start);
		}
	});
	resizeObserver.observe(bar);
}

function applyOverflowPolicy(barWidth) {
	if (barWidth <= tabletPx) {
		// Tablet + mobile: CSS handles the all-hide of originals.
		// Mirrors are visible by default. Clear runtime classes that
		// only make sense at narrow desktop.
		for (let i = 0; i < entries.length; i++) {
			entries[i].el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entries[i].id, false);
		}
		return;
	}

	if (barWidth > NARROW_DESKTOP_MAX) {
		// Wide desktop: every plugin original fits inline. The trigger
		// itself is CSS-hidden; mirrors don't matter.
		for (let i = 0; i < entries.length; i++) {
			entries[i].el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entries[i].id, false);
		}
		return;
	}

	// Narrow desktop: priority-ordered per-node overflow. Each entry
	// fits inline until cumulative width exceeds the bar's available
	// space; later entries are hidden and their mirrors shown.
	const available = barWidth - TRIGGER_RESERVE_PX;
	let used = 0;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		used += entry.width;
		const overflows = used > available;
		if (overflows) {
			entry.el.classList.add(OVERFLOW_CLASS);
			setMirrorShown(entry.id, true);
		} else {
			entry.el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entry.id, false);
		}
	}
}

function setMirrorShown(originalHtmlId, shown) {
	if (!originalHtmlId || !originalHtmlId.startsWith(ORIGINAL_PREFIX)) return;
	const mirrorId = MIRROR_PREFIX + originalHtmlId.slice(ORIGINAL_PREFIX.length);
	const mirror = document.getElementById(mirrorId);
	if (!mirror) return;
	if (shown) {
		mirror.classList.add(MIRROR_SHOWN_CLASS);
	} else {
		mirror.classList.remove(MIRROR_SHOWN_CLASS);
	}
}

export function teardownOverflow() {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	entries = [];
}
