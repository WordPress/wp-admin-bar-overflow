<?php
/**
 * Minimal PHPUnit bootstrap.
 *
 * Defines the narrow set of WordPress shims the pure-function classes need so
 * unit tests run without booting all of WordPress. For full integration tests
 * that exercise the classifier against `$wp_admin_bar`, run against a real WP
 * install where the helpers are available natively.
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/../../../../../' );
}

if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	/**
	 * Test shim mirroring `wp_strip_all_tags`. Strips HTML and collapses
	 * whitespace.
	 *
	 * @param string $value Input value.
	 * @return string Tag-stripped, trimmed result.
	 */
	function wp_strip_all_tags( $value ): string { // phpcs:ignore WordPress.WP.AlternativeFunctions
		$value = preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $value );
		$value = wp_test_strip_tags( $value );
		return trim( preg_replace( '/[\s]+/', ' ', $value ) );
	}
}

if ( ! function_exists( 'wp_test_strip_tags' ) ) {
	/**
	 * Internal helper isolating the `strip_tags()` call so the WPCS sniff
	 * suppression has the smallest possible scope.
	 *
	 * @param string $value Input value.
	 * @return string
	 */
	function wp_test_strip_tags( string $value ): string {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags
		return strip_tags( $value );
	}
}

if ( ! function_exists( 'wp_json_encode' ) ) {
	/**
	 * Test shim wrapping `json_encode` so callers that rely on WordPress's
	 * `wp_json_encode` flag conventions (`JSON_HEX_TAG | JSON_HEX_AMP |
	 * JSON_HEX_APOS | JSON_HEX_QUOT`) work in isolation.
	 *
	 * @param mixed $data    The data to encode.
	 * @param int   $options Bitmask of JSON encode options.
	 * @param int   $depth   Maximum depth.
	 * @return string|false
	 */
	function wp_json_encode( $data, int $options = 0, int $depth = 512 ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
		return json_encode( $data, $options, $depth );
	}
}

if ( ! function_exists( 'esc_attr' ) ) {
	/**
	 * Test shim mirroring `esc_attr`'s neutralisation of `<`, `>`, `&`, `"`,
	 * `'` for attribute context.
	 *
	 * @param string $value Input value.
	 * @return string Escaped attribute value.
	 */
	function esc_attr( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
	}
}

if ( ! function_exists( '__' ) ) {
	/**
	 * Test shim returning the input verbatim. The domain argument is ignored
	 * because the test bootstrap does not load text domains.
	 *
	 * @param string $text   Text to translate.
	 * @param string $domain Translation domain (ignored).
	 * @return string
	 */
	function __( string $text, string $domain = 'default' ): string {
		unset( $domain );
		return $text;
	}
}

if ( ! function_exists( 'str_contains' ) ) {
	/**
	 * Polyfill for PHP 8.0 environments where `str_contains` is unavailable.
	 *
	 * @param string $haystack Search context.
	 * @param string $needle   Substring to find.
	 * @return bool
	 */
	function str_contains( string $haystack, string $needle ): bool {
		return '' === $needle || false !== strpos( $haystack, $needle );
	}
}

if ( ! isset( $GLOBALS['__wpabo_filters'] ) ) {
	$GLOBALS['__wpabo_filters'] = array();
}

if ( ! function_exists( 'add_filter' ) ) {
	/**
	 * Minimal `add_filter` shim. Stores the callback keyed by hook and
	 * priority for later replay by `apply_filters`.
	 *
	 * @param string   $hook          Hook name.
	 * @param callable $callback      Callback to register.
	 * @param int      $priority      Priority (default 10).
	 * @param int      $accepted_args Number of arguments the callback accepts.
	 */
	function add_filter( string $hook, callable $callback, int $priority = 10, int $accepted_args = 1 ): bool {
		if ( ! isset( $GLOBALS['__wpabo_filters'][ $hook ] ) ) {
			$GLOBALS['__wpabo_filters'][ $hook ] = array();
		}
		$GLOBALS['__wpabo_filters'][ $hook ][ $priority ][] = array(
			'callback'      => $callback,
			'accepted_args' => $accepted_args,
		);
		return true;
	}
}

if ( ! function_exists( 'remove_all_filters' ) ) {
	/**
	 * Drop every registered filter callback. Optionally scoped to one hook.
	 *
	 * @param string|null $hook Hook name to clear, or null for all hooks.
	 */
	function remove_all_filters( ?string $hook = null ): void {
		if ( null === $hook ) {
			$GLOBALS['__wpabo_filters'] = array();
			return;
		}
		unset( $GLOBALS['__wpabo_filters'][ $hook ] );
	}
}

if ( ! function_exists( 'apply_filters' ) ) {
	/**
	 * Run every callback registered against the hook, in priority order,
	 * threading the running value through each callback.
	 *
	 * @param string $hook    Hook name.
	 * @param mixed  ...$args Initial value followed by any extra arguments.
	 * @return mixed Final value.
	 */
	function apply_filters( string $hook, ...$args ) {
		$value = $args[0] ?? null;
		if ( empty( $GLOBALS['__wpabo_filters'][ $hook ] ) ) {
			return $value;
		}
		$priorities = $GLOBALS['__wpabo_filters'][ $hook ];
		ksort( $priorities, SORT_NUMERIC );
		foreach ( $priorities as $callbacks ) {
			foreach ( $callbacks as $entry ) {
				$call_args    = $args;
				$call_args[0] = $value;
				$value        = call_user_func_array(
					$entry['callback'],
					array_slice( $call_args, 0, $entry['accepted_args'] )
				);
			}
		}
		return $value;
	}
}

if ( ! function_exists( 'get_current_user_id' ) ) {
	/**
	 * Return the current user id. Tests set `$GLOBALS['__wpabo_user_id']` to
	 * control the value.
	 */
	function get_current_user_id(): int {
		return isset( $GLOBALS['__wpabo_user_id'] ) ? (int) $GLOBALS['__wpabo_user_id'] : 0;
	}
}

require_once __DIR__ . '/helpers/class-wp-admin-bar-overflow-test-bar.php';
require_once __DIR__ . '/../src/interface-admin-bar-overflow-storage.php';
require_once __DIR__ . '/../src/class-admin-bar-overflow-user-meta-storage.php';
require_once __DIR__ . '/../src/registry.php';
require_once __DIR__ . '/../src/class-admin-bar-overflow-classifier.php';
require_once __DIR__ . '/../src/class-admin-bar-overflow-data-planner.php';
