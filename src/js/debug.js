/**
 * Per-request runtime instrumentation. Exposed only when the PHP-side
 * `WP_ADMIN_BAR_OVERFLOW_DEBUG` constant is defined; otherwise
 * `window.omnibarPlugins` stays undefined and no measurement state is
 * exposed to host JS.
 *
 * Tracks two things:
 *
 *   - `observerCount`: number of MutationObserver instances the runtime
 *     created. The single-observer mandate (Decision 8) means this must
 *     equal 1 once `setupMutationSync` runs.
 *   - `observerStats`: rolling samples of MutationObserver callback
 *     duration. Exposed as `{ count, p50, p95, max }`. The p95 ≤ 4 ms gate
 *     in the A.1 entry-checkpoint reads this.
 */

let observerCount = 0;
const samples = [];
const MAX_SAMPLES = 500;

export function trackObserverCreated() {
	observerCount += 1;
}

export function recordObserverCallback(durationMs) {
	if (samples.length >= MAX_SAMPLES) {
		// Drop the oldest sample to keep memory bounded over long sessions.
		samples.shift();
	}
	samples.push(durationMs);
}

export function exposeDebugWhenEnabled(flagsDebug) {
	if (!flagsDebug) return;
	if (!window.omnibarPlugins) {
		window.omnibarPlugins = {};
	}
	window.omnibarPlugins.debug = {
		get observerCount() {
			return observerCount;
		},
		get observerStats() {
			if (samples.length === 0) return null;
			const sorted = samples.slice().sort((a, b) => a - b);
			const n = sorted.length;
			const at = (q) => sorted[Math.min(n - 1, Math.floor(n * q))];
			return {
				count: n,
				p50: at(0.5),
				p95: at(0.95),
				max: sorted[n - 1],
			};
		},
	};
}
