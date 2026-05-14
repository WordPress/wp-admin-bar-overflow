/**
 * Single shared MutationObserver covering `#wpadminbar`. Decision 8 forbids
 * one-observer-per-node; this module is the only place a MutationObserver
 * is instantiated. Each callback is timed and recorded into the debug
 * sample buffer so the `p95 ≤ 4 ms` gate can be asserted from
 * `window.omnibarPlugins.debug.observerStats`.
 *
 * Sync strategy: when a mutation lands on (or anywhere inside) a
 * plugin-classified original, the matching mirror is re-cloned in place.
 * Full re-cloning is simpler and more robust than per-mutation diffing —
 * it preserves text + class + aria changes uniformly, and the cost is
 * dominated by `cloneNode(true)` of a small subtree (well inside the 4 ms
 * budget on the F1 fixture).
 *
 * The "is this affecting a plugin original" check walks up from the
 * mutation target to the nearest `<li>` whose id is in the original set.
 * Mutations on the mirrors themselves are ignored — their ids carry the
 * `wp-admin-bar-mirror-` prefix and never appear in the set. This avoids
 * an infinite re-clone loop.
 */

import { trackObserverCreated, recordObserverCallback } from './debug.js';
import { buildMirror, getPluginEntry } from './mirror.js';

const MIRROR_PREFIX = 'wp-admin-bar-mirror-';

let observer = null;

export function setupMutationSync(bar, pluginIdSet) {
	if (observer) return;
	if (typeof MutationObserver === 'undefined') return;
	if (!bar) return;

	observer = new MutationObserver((mutations) => {
		const start = performance.now();
		try {
			const affected = collectAffectedOriginals(mutations, bar, pluginIdSet);
			if (affected.size > 0) {
				refreshMirrors(affected);
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

function collectAffectedOriginals(mutations, bar, pluginIdSet) {
	const affected = new Set();
	for (let i = 0; i < mutations.length; i++) {
		const m = mutations[i];
		let cursor = m.target;
		if (cursor && cursor.nodeType !== 1) {
			cursor = cursor.parentElement;
		}
		while (cursor && cursor !== bar) {
			const id = cursor.id;
			if (id) {
				if (id.indexOf(MIRROR_PREFIX) === 0) {
					// Inside a mirror — never trigger sync on these,
					// otherwise refreshing the mirror would loop.
					break;
				}
				if (pluginIdSet.has(id)) {
					affected.add(id);
					break;
				}
			}
			cursor = cursor.parentElement;
		}
	}
	return affected;
}

function refreshMirrors(originalIds) {
	for (const originalId of originalIds) {
		const original = document.getElementById(originalId);
		const entry = getPluginEntry(originalId);
		if (!original || !entry) continue;

		const existingMirrorId = MIRROR_PREFIX + originalId.slice('wp-admin-bar-'.length);
		const existing = document.getElementById(existingMirrorId);
		if (!existing || !existing.parentNode) continue;

		const fresh = buildMirror(original, entry);
		existing.parentNode.replaceChild(fresh, existing);
	}
}
