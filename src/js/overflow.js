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
const TRIGGER_HTML_ID = 'wp-admin-bar-overflow-plugins';
const TRIGGER_ACTIVE_CLASS = 'wp-admin-bar-overflow-trigger-active';
const ORIGINAL_PREFIX = 'wp-admin-bar-';
const MIRROR_PREFIX = 'wp-admin-bar-mirror-';
const MIN_TRIGGER_WIDTH_PX = 36;
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
		const width = outerWidth(el);
		el.classList.add(CLASSIFIED_CLASS);
		entries.push({ id: classifiedPluginIds[i], el, width });
	}

	applyOverflowPolicy(bar.offsetWidth);

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
	const trigger = document.getElementById(TRIGGER_HTML_ID);
	if (barWidth <= tabletPx) {
		// Tablet + mobile: CSS handles the all-hide of originals.
		// Mirrors are visible by default. Clear runtime classes that
		// only make sense at narrow desktop.
		setTriggerActive(trigger, true);
		for (let i = 0; i < entries.length; i++) {
			entries[i].el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entries[i].id, false);
		}
		return;
	}

	if (barWidth > NARROW_DESKTOP_MAX) {
		// Wide desktop: every plugin original fits inline. The trigger
		// itself is CSS-hidden; mirrors don't matter.
		setTriggerActive(trigger, false);
		for (let i = 0; i < entries.length; i++) {
			entries[i].el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entries[i].id, false);
		}
		return;
	}

	// Narrow desktop: first return all originals to their natural layout
	// and hide the trigger. Then calculate the real plugin budget after
	// subtracting non-plugin left and right admin-bar items plus the trigger.
	setTriggerActive(trigger, false);
	for (let i = 0; i < entries.length; i++) {
		entries[i].el.classList.remove(OVERFLOW_CLASS);
		setMirrorShown(entries[i].id, false);
		entries[i].width = outerWidth(entries[i].el);
	}

	const available = measureAvailablePluginWidth(barWidth, trigger);
	const totalPluginWidth = entries.reduce((sum, entry) => sum + entry.width, 0);
	if (totalPluginWidth <= available) {
		return;
	}

	setTriggerActive(trigger, true);
	let used = 0;
	let shownMirrors = 0;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const fits = entry.width > 0 && used + entry.width <= available;
		if (fits) {
			used += entry.width;
			entry.el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entry.id, false);
		} else {
			entry.el.classList.add(OVERFLOW_CLASS);
			setMirrorShown(entry.id, true);
			shownMirrors += 1;
		}
	}
	setTriggerActive(trigger, shownMirrors > 0);
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

function setTriggerActive(trigger, active) {
	if (!trigger) return;
	if (active) {
		trigger.classList.add(TRIGGER_ACTIVE_CLASS);
	} else {
		trigger.classList.remove(TRIGGER_ACTIVE_CLASS);
		trigger.classList.remove('hover');
		const anchor = trigger.querySelector(':scope > a.ab-item');
		if (anchor) anchor.setAttribute('aria-expanded', 'false');
	}
}

function measureAvailablePluginWidth(barWidth, trigger) {
	const rootDefault = document.getElementById('wp-admin-bar-root-default');
	const topSecondary = document.getElementById('wp-admin-bar-top-secondary');
	const pluginIds = new Set(entries.map((entry) => entry.id));
	const nonPluginLeft = sumTopLevelChildWidths(rootDefault, pluginIds, trigger);
	const nonPluginRight = sumTopLevelChildWidths(topSecondary, pluginIds, trigger);
	const triggerWidth = measureTriggerWidth(trigger);
	return Math.max(0, Math.floor(barWidth - nonPluginLeft - nonPluginRight - triggerWidth));
}

function sumTopLevelChildWidths(parent, pluginIds, trigger) {
	if (!parent) return 0;
	let total = 0;
	const children = Array.from(parent.children || []);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child === trigger || pluginIds.has(child.id)) continue;
		if (getComputedStyle(child).display === 'none') continue;
		total += outerWidth(child);
	}
	return total;
}

function measureTriggerWidth(trigger) {
	if (!trigger) return 0;
	const visibleWidth = outerWidth(trigger);
	if (visibleWidth > 0) return visibleWidth;

	const previousDisplay = trigger.style.display;
	const previousPosition = trigger.style.position;
	const previousVisibility = trigger.style.visibility;

	trigger.style.display = 'block';
	trigger.style.position = 'absolute';
	trigger.style.visibility = 'hidden';
	const width = outerWidth(trigger);

	trigger.style.display = previousDisplay;
	trigger.style.position = previousPosition;
	trigger.style.visibility = previousVisibility;

	return width || MIN_TRIGGER_WIDTH_PX;
}

function outerWidth(el) {
	if (!el) return 0;
	const rect = el.getBoundingClientRect();
	const style = getComputedStyle(el);
	const marginLeft = parseFloat(style.marginLeft) || 0;
	const marginRight = parseFloat(style.marginRight) || 0;
	return (rect.width || el.offsetWidth || 0) + marginLeft + marginRight;
}

export function teardownOverflow() {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	entries = [];
}
