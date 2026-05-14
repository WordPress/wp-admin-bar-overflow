/**
 * Single shared MutationObserver covering `#wpadminbar`. Decision 8 forbids
 * one-observer-per-node; this module is the only place a MutationObserver
 * is instantiated. Each callback is timed and recorded into the debug
 * sample buffer so the p95 ≤ 4 ms gate can be asserted from
 * `window.omnibarPlugins.debug.observerStats`.
 *
 * For the entry-checkpoint prototype the callback's body walks the
 * mutation batch and filters to the plugin-classified id set. That is the
 * shape the A.1 mirror-sync work will use; running it for real gives the
 * gate a representative measurement.
 */

import { trackObserverCreated, recordObserverCallback } from './debug.js';

let observer = null;

export function setupMutationSync(bar, pluginIdSet) {
	if (observer) return;
	if (typeof MutationObserver === 'undefined') return;
	if (!bar) return;

	observer = new MutationObserver((mutations) => {
		const start = performance.now();
		try {
			for (let i = 0; i < mutations.length; i++) {
				const m = mutations[i];
				const target = m.target;
				if (!target) continue;
				let cursor = target;
				while (cursor && cursor !== bar) {
					if (cursor.id && pluginIdSet.has(cursor.id)) {
						// Real mirror-sync lands in A.1 work item 5; the
						// prototype only walks the chain to charge the
						// representative cost into the observer-callback
						// p95 sample.
						break;
					}
					cursor = cursor.parentElement;
				}
			}
		} finally {
			recordObserverCallback(performance.now() - start);
		}
	});
	trackObserverCreated();
	observer.observe(bar, {
		attributes: true,
		childList: true,
		characterData: true,
		subtree: true,
	});
}

export function teardownMutationSync() {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
}
