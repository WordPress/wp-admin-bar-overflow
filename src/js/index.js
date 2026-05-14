/**
 * Runtime entry. Reads the inline NavModel JSON, bootstraps the four
 * subsystems (overflow, mirror, click-forward, mutation-sync), and exposes
 * the debug API when `WP_ADMIN_BAR_OVERFLOW_DEBUG` is defined PHP-side.
 *
 * Fast-exit shape: when the page has no plugin-classified nodes (F3 — bare
 * WP), the bootstrap parses the JSON, finds no plugin nodes, and returns
 * before instantiating any observer. The no-op idle cost gate (≤ 0.5 ms
 * on F3 first paint) reads this path.
 */

import { setupOverflow } from './overflow.js';
import { setupMirror } from './mirror.js';
import { setupClickForward } from './click-forward.js';
import { setupMutationSync } from './mutation-sync.js';
import { exposeDebugWhenEnabled } from './debug.js';

(function bootstrap() {
	if (typeof performance !== 'undefined' && performance.mark) {
		try {
			performance.mark('wpabo:start');
		} catch (err) {
			// User Timing is best-effort; survives any UA gap silently.
		}
	}
	const finish = () => {
		if (typeof performance !== 'undefined' && performance.measure) {
			try {
				performance.measure('wpabo:bootstrap', 'wpabo:start');
			} catch (err) {
			// User Timing is best-effort; survives any UA gap silently.
		}
		}
	};

	const dataEl = document.getElementById('wp-admin-bar-overflow-data');
	if (!dataEl) {
		finish();
		return;
	}

	let navModel;
	try {
		navModel = JSON.parse(dataEl.textContent);
	} catch (err) {
		finish();
		return;
	}
	if (!navModel || !navModel.enabled) {
		finish();
		return;
	}

	const allNodes = navModel.nodes || [];
	const pluginIds = [];
	for (let i = 0; i < allNodes.length; i++) {
		const node = allNodes[i];
		if (node && node.class === 'plugin' && node.nodeId) {
			pluginIds.push(node.nodeId);
		}
	}
	if (pluginIds.length === 0) {
		finish();
		return;
	}

	const bar = document.getElementById('wpadminbar');
	if (!bar) {
		finish();
		return;
	}

	setupOverflow(bar, pluginIds, navModel.breakpoints || {});
	setupMirror(bar, navModel);
	setupClickForward(bar);
	setupMutationSync(bar, new Set(pluginIds));

	exposeDebugWhenEnabled(navModel.flags && navModel.flags.debug);
	finish();
})();
