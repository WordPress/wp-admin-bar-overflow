<?php
/**
 * Emits the inline NavModel JSON.
 *
 * Hooked at `wp_before_admin_bar_render` priority `PHP_INT_MAX - 1` (after the
 * classifier at priority 10 has cached the model). Prints
 * `<script type="application/json" id="wp-admin-bar-overflow-data">…</script>`
 * with `wp_json_encode` + `JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS |
 * JSON_HEX_QUOT` so plugin-supplied label content cannot break out of the
 * inline element.
 *
 * The runtime reads the payload via
 * `JSON.parse(document.getElementById('wp-admin-bar-overflow-data').textContent)`;
 * no `window` global is exported (`03-contracts.md` § 6).
 *
 * Contract reference: `03-contracts.md` § 2 (NavModel), § 8 (DOM shapes).
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( class_exists( 'Admin_Bar_Overflow_Data_Planner' ) ) {
	return;
}

/**
 * Inline NavModel emitter. Reads the cached model from the classifier and
 * prints the JSON. No-op when the classifier never built a model.
 */
class Admin_Bar_Overflow_Data_Planner {

	const SCRIPT_ID = 'wp-admin-bar-overflow-data';

	/**
	 * Emit the inline `<script type="application/json">` block.
	 */
	public static function emit(): void {
		$json = self::render();
		if ( null === $json ) {
			return;
		}

		printf(
			"<script type=\"application/json\" id=\"%s\">%s</script>\n",
			esc_attr( self::SCRIPT_ID ),
			// JSON_HEX_* flags already neutralised `<`, `>`, `&`, `'`, `"` into
			// hex escapes, which is the protection that matters for an inline
			// `<script type="application/json">` payload. The remaining string
			// is hex-escaped JSON ASCII, safe to print as-is. The output is the
			// element's text content (browsers do not execute
			// `type="application/json"`); HTML escaping would double-encode.
			$json // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		);
	}

	/**
	 * Render the NavModel as a JSON string. Returns null when no nav model
	 * exists (gating denied, classifier didn't run, etc.) or when
	 * `wp_json_encode` fails.
	 */
	public static function render(): ?string {
		$nav_model = Admin_Bar_Overflow_Classifier::get_nav_model();
		if ( null === $nav_model ) {
			return null;
		}

		$json = wp_json_encode(
			$nav_model,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
		);
		return false === $json ? null : $json;
	}
}
