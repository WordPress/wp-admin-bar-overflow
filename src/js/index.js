/**
 * Runtime bootstrap. Reads the inline NavModel JSON, decides whether to run,
 * and wires up the overflow / mirror / mutation-sync subsystems.
 *
 * Filled in by the JS-runtime task; this stub exists so the build pipeline
 * has a valid entry point and the bundle gate can run on day one.
 */

const dataEl = document.getElementById('wp-admin-bar-overflow-data');
if (dataEl) {
	try {
		JSON.parse(dataEl.textContent);
	} catch (err) {
		// Bad JSON: bail rather than crash on a malformed payload.
	}
}
