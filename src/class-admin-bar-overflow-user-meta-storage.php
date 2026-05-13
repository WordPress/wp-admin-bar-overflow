<?php
/**
 * Portable WP user-meta storage. Phase 2 customize / reorder uses this when
 * no host adapter rebinds the `wp_admin_bar_overflow_storage` filter.
 *
 * Phase 1 declares the class so the storage filter contract is stable from
 * v0.1.0 onward, but no Phase 1 code path reads or writes through it.
 *
 * The class is scoped under the plugin's name (rather than the generic
 * `WP_User_Meta_Storage`) so the plugin can coexist on a site with other
 * plugins that ship a similarly-named storage adapter.
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( class_exists( 'Admin_Bar_Overflow_User_Meta_Storage' ) ) {
	return;
}

/**
 * Stores layouts in a single `wp_admin_bar_overflow_layouts` user-meta entry,
 * shaped as `array<int, LayoutDelta>` keyed by `site_id`.
 */
class Admin_Bar_Overflow_User_Meta_Storage implements Admin_Bar_Overflow_Layout_Storage {

	const META_KEY = 'wp_admin_bar_overflow_layouts';

	/**
	 * Read every site's `LayoutDelta` for the given user.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array<int, array>
	 */
	public function get_layouts( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return array();
		}
		$raw = get_user_meta( $user_id, self::META_KEY, true );
		return is_array( $raw ) ? $raw : array();
	}

	/**
	 * Write the full delta map.
	 *
	 * @param int               $user_id WordPress user id.
	 * @param array<int, array> $layouts Map of `site_id` => `LayoutDelta`.
	 */
	public function put_layouts( int $user_id, array $layouts ): bool {
		if ( $user_id <= 0 ) {
			return false;
		}
		return false !== update_user_meta( $user_id, self::META_KEY, $layouts );
	}
}
