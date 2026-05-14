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
	const dataEl = document.getElementById('wp-admin-bar-overflow-data');
	if (!dataEl) return;

	let navModel;
	try {
		navModel = JSON.parse(dataEl.textContent);
	} catch (err) {
		return;
	}
	if (!navModel || !navModel.enabled) return;

	const allNodes = navModel.nodes || [];
	const pluginIds = [];
	for (let i = 0; i < allNodes.length; i++) {
		const node = allNodes[i];
		if (node && node.class === 'plugin' && node.nodeId) {
			pluginIds.push(node.nodeId);
		}
	}
	if (pluginIds.length === 0) return;

	const bar = document.getElementById('wpadminbar');
	if (!bar) return;

	setupOverflow(bar, pluginIds, navModel.breakpoints || {});
	setupMirror(bar, navModel);
	setupClickForward(bar);
	setupMutationSync(bar, new Set(pluginIds));

	exposeDebugWhenEnabled(navModel.flags && navModel.flags.debug);
})();
