<?php
/**
 * Minimal PHPUnit bootstrap.
 *
 * Defines the WordPress shims the pure-function classes need so unit tests
 * run without booting all of WordPress. The shims here are deliberately
 * narrow — for full integration tests that exercise the classifier against
 * `$wp_admin_bar`, run against a real WP install where the helpers are
 * available natively.
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/../../../../../' );
}

if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	/**
	 * Test shim. Strips HTML and collapses whitespace.
	 *
	 * @param string $string Input.
	 */
	function wp_strip_all_tags( $string ): string {
		$string = preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $string );
		$string = strip_tags( $string );
		return trim( preg_replace( '/[\s]+/', ' ', $string ) );
	}
}

if ( ! function_exists( 'wp_json_encode' ) ) {
	/**
	 * Test shim. Wraps `json_encode` so callers that rely on WordPress's
	 * `wp_json_encode` flag conventions (`JSON_HEX_TAG | JSON_HEX_AMP |
	 * JSON_HEX_APOS | JSON_HEX_QUOT`) work in isolation.
	 *
	 * @param mixed $data    The data to encode.
	 * @param int   $options Bitmask of JSON encode options.
	 * @param int   $depth   Maximum depth.
	 * @return string|false
	 */
	function wp_json_encode( $data, int $options = 0, int $depth = 512 ) {
		return json_encode( $data, $options, $depth );
	}
}

if ( ! function_exists( 'str_contains' ) ) {
	function str_contains( string $haystack, string $needle ): bool {
		return '' === $needle || false !== strpos( $haystack, $needle );
	}
}

// Class loading happens here when the classifier + data planner files land.
// PHPUnit test files then declare their own `require_once` of the class
// under test, so a bare bootstrap stays minimal.
