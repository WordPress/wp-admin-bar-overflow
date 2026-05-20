/**
 * ResizeObserver-driven visual-order overflow.
 *
 * On startup the module marks every classified-as-plugin original with the
 * `wp-admin-bar-overflow-classified-plugin-node` class so the responsive
 * stylesheet's `@media (max-width: 782px)` rule can hide all of them at
 * tablet + mobile bands. Above that breakpoint the ResizeObserver decides
 * which originals still fit. The cutoff follows measured visual order, so
 * items leave the visible bar from the visual right edge first instead of
 * from nav-model priority order. The mirror cloning is a separate concern
 * (A.1 work item 3).
 */

import { recordResizeCallback } from './debug.js';

const CLASSIFIED_CLASS = 'wp-admin-bar-overflow-classified-plugin-node';
const OVERFLOW_CLASS = 'wp-admin-bar-overflow-hidden-by-overflow';
const MIRROR_SHOWN_CLASS = 'wp-admin-bar-overflow-mirror-shown';
const TRIGGER_HTML_ID = 'wp-admin-bar-overflow-plugins';
const TRIGGER_ACTIVE_CLASS = 'wp-admin-bar-overflow-trigger-active';
const PLACEHOLDER_GROUP_HTML_ID = 'wp-admin-bar-overflow-plugins-default';
const ORIGINAL_PREFIX = 'wp-admin-bar-';
const MIRROR_PREFIX = 'wp-admin-bar-mirror-';
const MIN_TRIGGER_WIDTH_PX = 36;

let resizeObserver = null;
let correctionFrame = null;
let correctionTimer = null;
let correctionPassesRemaining = 0;
let correctionTimerPassesRemaining = 0;
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
		const rect = el.getBoundingClientRect();
		const width = outerWidth(el);
		el.classList.add(CLASSIFIED_CLASS);
		entries.push({
			id: classifiedPluginIds[i],
			el,
			width,
			visualLeft: rect.left,
			visualTop: rect.top,
			domIndex: i,
		});
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

	// Desktop: calculate the real plugin budget after subtracting non-plugin
	// left and right admin-bar items plus the trigger. Use cached natural
	// widths and first-paint visual order so resize ticks cannot pick
	// different winners because layout has not caught up with a class removal.
	setTriggerActive(trigger, false);

	const available = measureAvailablePluginWidth(barWidth, trigger);
	const totalPluginWidth = entries.reduce((sum, entry) => sum + entry.width, 0);
	const visualEntries = entries.slice().sort(compareVisualPosition);
	let cutoff = visualEntries.length;

	if (totalPluginWidth > available) {
		let used = 0;
		for (let i = 0; i < visualEntries.length; i++) {
			const entry = visualEntries[i];
			const fits = entry.width > 0 && used + entry.width <= available;
			if (!fits) {
				cutoff = i;
				break;
			}
			used += entry.width;
		}
	}

	let overflowedIds = applyVisualCutoff(visualEntries, cutoff);
	if (overflowedIds.length === 0 && !topLevelItemsOverflow()) {
		scheduleTopLevelFitCorrection();
		return;
	}

	setTriggerActive(trigger, true);
	while (topLevelItemsOverflow() && cutoff > 0) {
		cutoff -= 1;
		overflowedIds = applyVisualCutoff(visualEntries, cutoff);
	}

	orderMirrors(overflowedIds.reverse());
	setTriggerActive(trigger, overflowedIds.length > 0);
	scheduleTopLevelFitCorrection();
}

function compareVisualPosition(a, b) {
	if (Math.abs(a.visualTop - b.visualTop) > 1) {
		return a.visualTop - b.visualTop;
	}
	if (Math.abs(a.visualLeft - b.visualLeft) > 1) {
		return a.visualLeft - b.visualLeft;
	}
	return a.domIndex - b.domIndex;
}

function applyVisualCutoff(visualEntries, cutoff) {
	const overflowedIds = [];
	for (let i = 0; i < visualEntries.length; i++) {
		const entry = visualEntries[i];
		if (i < cutoff) {
			entry.el.classList.remove(OVERFLOW_CLASS);
			setMirrorShown(entry.id, false);
		} else {
			entry.el.classList.add(OVERFLOW_CLASS);
			setMirrorShown(entry.id, true);
			overflowedIds.push(entry.id);
		}
	}
	return overflowedIds;
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

function topLevelItemsOverflow() {
	if (!bar) return false;
	const barTop = bar.getBoundingClientRect().top;
	const rootDefault = document.getElementById('wp-admin-bar-root-default');
	const topSecondary = document.getElementById('wp-admin-bar-top-secondary');
	const parents = [rootDefault, topSecondary];
	let leftRight = 0;
	let rightLeft = null;

	for (let i = 0; i < parents.length; i++) {
		const parent = parents[i];
		if (!parent) continue;
		const children = Array.from(parent.children || []);
		for (let j = 0; j < children.length; j++) {
			const child = children[j];
			if (getComputedStyle(child).display === 'none') continue;
			const rect = child.getBoundingClientRect();
			if (Math.abs(rect.top - barTop) > 1) {
				return true;
			}
			if (parent === rootDefault) {
				leftRight = Math.max(leftRight, rect.right);
			} else if (parent === topSecondary) {
				rightLeft = null === rightLeft ? rect.left : Math.min(rightLeft, rect.left);
			}
		}
	}
	return null !== rightLeft && leftRight > rightLeft + 1;
}

function scheduleTopLevelFitCorrection() {
	if (typeof requestAnimationFrame !== 'undefined') {
		correctionPassesRemaining = Math.max(correctionPassesRemaining, 4);
		if (correctionFrame === null) {
			correctionFrame = requestAnimationFrame(runTopLevelFitCorrection);
		}
	}
	if (typeof setTimeout !== 'undefined') {
		correctionTimerPassesRemaining = Math.max(correctionTimerPassesRemaining, 10);
		if (correctionTimer === null) {
			correctionTimer = setTimeout(runTimedTopLevelFitCorrection, 50);
		}
	}
}

function runTopLevelFitCorrection() {
	correctionFrame = null;
	enforceTopLevelFit();
	correctionPassesRemaining -= 1;
	if (correctionPassesRemaining > 0) {
		correctionFrame = requestAnimationFrame(runTopLevelFitCorrection);
	}
}

function runTimedTopLevelFitCorrection() {
	correctionTimer = null;
	enforceTopLevelFit();
	correctionTimerPassesRemaining -= 1;
	if (correctionTimerPassesRemaining > 0) {
		correctionTimer = setTimeout(runTimedTopLevelFitCorrection, 50);
	}
}

function enforceTopLevelFit() {
	if (!bar || bar.offsetWidth <= tabletPx || !topLevelItemsOverflow()) return;
	const trigger = document.getElementById(TRIGGER_HTML_ID);
	setTriggerActive(trigger, true);

	const visualEntries = entries.slice().sort(compareVisualPosition);
	let cutoff = visualEntries.length;
	for (let i = 0; i < visualEntries.length; i++) {
		if (visualEntries[i].el.classList.contains(OVERFLOW_CLASS)) {
			cutoff = i;
			break;
		}
	}

	let overflowedIds = [];
	while (topLevelItemsOverflow() && cutoff > 0) {
		cutoff -= 1;
		overflowedIds = applyVisualCutoff(visualEntries, cutoff);
	}

	if (overflowedIds.length === 0 && cutoff < visualEntries.length) {
		overflowedIds = visualEntries.slice(cutoff).map((entry) => entry.id);
	}
	if (overflowedIds.length > 0) {
		orderMirrors(overflowedIds.reverse());
	}
	setTriggerActive(trigger, overflowedIds.length > 0);
}

function orderMirrors(originalHtmlIds) {
	const group = document.getElementById(PLACEHOLDER_GROUP_HTML_ID);
	if (!group) return;

	const fragment = document.createDocumentFragment();
	for (let i = 0; i < originalHtmlIds.length; i++) {
		const originalHtmlId = originalHtmlIds[i];
		if (!originalHtmlId || !originalHtmlId.startsWith(ORIGINAL_PREFIX)) continue;
		const mirrorId = MIRROR_PREFIX + originalHtmlId.slice(ORIGINAL_PREFIX.length);
		const mirror = document.getElementById(mirrorId);
		if (mirror && mirror.parentNode === group) {
			fragment.appendChild(mirror);
		}
	}
	if (fragment.childNodes.length > 0) {
		group.appendChild(fragment);
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
	if (correctionFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
		cancelAnimationFrame(correctionFrame);
		correctionFrame = null;
	}
	if (correctionTimer !== null && typeof clearTimeout !== 'undefined') {
		clearTimeout(correctionTimer);
		correctionTimer = null;
	}
	correctionPassesRemaining = 0;
	correctionTimerPassesRemaining = 0;
	entries = [];
}
