/**
 * Per-request runtime instrumentation. Exposed only when the PHP-side
 * `WP_ADMIN_BAR_OVERFLOW_DEBUG` constant is defined; otherwise
 * `window.omnibarPlugins` stays undefined and no measurement state is
 * exposed to host JS.
 *
 * Tracks:
 *
 *   - `observerCount`: number of MutationObserver instances the runtime
 *     created. Single-observer mandate (Decision 8) means this must be 1
 *     once `setupMutationSync` has run.
 *   - `observerStats`: rolling samples of MutationObserver callback
 *     duration. Exposed as `{ count, p50, p95, max, total }`.
 *   - `resizeStats`: same shape for the ResizeObserver callback. The
 *     continuous-resize CPU gate reads `total`; the per-callback p95 in
 *     A.1 implementation will read `p95`.
 *   - `longTaskCount`: number of `PerformanceObserver` `longtask` entries
 *     fired since debug exposure. The continuous-resize gate asserts this
 *     stays 0.
 *
 * Adds the per-request `wpabo:bootstrap` `User Timing` mark/measure
 * pair regardless of the debug flag; the F3 no-op idle gate reads it via
 * `performance.getEntriesByName('wpabo:bootstrap')[0].duration` without
 * needing the debug API.
 */

let observerCount = 0;
const observerSamples = [];
const resizeSamples = [];
let longTaskCount = 0;
const MAX_SAMPLES = 500;

export function trackObserverCreated() {
	observerCount += 1;
}

export function recordObserverCallback(durationMs) {
	if (observerSamples.length >= MAX_SAMPLES) observerSamples.shift();
	observerSamples.push(durationMs);
}

export function recordResizeCallback(durationMs) {
	if (resizeSamples.length >= MAX_SAMPLES) resizeSamples.shift();
	resizeSamples.push(durationMs);
}

function summarise(samples) {
	if (samples.length === 0) return null;
	const sorted = samples.slice().sort((a, b) => a - b);
	const n = sorted.length;
	const at = (q) => sorted[Math.min(n - 1, Math.floor(n * q))];
	let total = 0;
	for (let i = 0; i < n; i++) total += sorted[i];
	return { count: n, p50: at(0.5), p95: at(0.95), max: sorted[n - 1], total };
}

export function exposeDebugWhenEnabled(flagsDebug) {
	if (!flagsDebug) return;
	if (!window.omnibarPlugins) window.omnibarPlugins = {};

	if (typeof PerformanceObserver !== 'undefined') {
		try {
			new PerformanceObserver((list) => {
				longTaskCount += list.getEntries().length;
			}).observe({ type: 'longtask', buffered: true });
		} catch (err) {
			// PerformanceObserver longtask is best-effort; some browsers throw.
		}
	}

	window.omnibarPlugins.debug = {
		get observerCount() {
			return observerCount;
		},
		get observerStats() {
			return summarise(observerSamples);
		},
		get resizeStats() {
			return summarise(resizeSamples);
		},
		get longTaskCount() {
			return longTaskCount;
		},
		reset() {
			observerSamples.length = 0;
			resizeSamples.length = 0;
			longTaskCount = 0;
		},
	};
}
