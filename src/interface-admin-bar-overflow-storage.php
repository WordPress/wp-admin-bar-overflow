<?php
/**
 * Layout storage interface.
 *
 * Phase 1 ships read-only behaviour, so no storage implementation is bound by
 * default. The interface is declared at v0.1.0 so the filter contract
 * (`wp_admin_bar_overflow_storage`) is stable from day one; the Phase 2
 * customize / reorder feature swaps in `WP_User_Meta_Storage` (plain WP) or a
 * host-supplied implementation via the same filter.
 *
 * Contract reference: `03-contracts.md` § 4.
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( ! interface_exists( 'Admin_Bar_Overflow_Layout_Storage' ) ) {

	/**
	 * Get / put per-site `LayoutDelta` blobs for a user.
	 *
	 * A `LayoutDelta` describes a user's per-site customization to the dropdown
	 * order. Phase 1 has no callers; Phase 2 adds the customize feature that
	 * reads + writes through this interface.
	 */
	interface Admin_Bar_Overflow_Layout_Storage {

		/**
		 * Read every site's `LayoutDelta` for the given user. Returns an empty
		 * array when no deltas exist for that user.
		 *
		 * @param int $user_id WordPress user id.
		 * @return array<int, array> Map of `site_id` => `LayoutDelta`.
		 */
		public function get_layouts( int $user_id ): array;

		/**
		 * Write the full per-site delta map for the given user. Overwrites
		 * whatever was previously stored. Returns `true` on success, `false`
		 * on any storage-layer failure.
		 *
		 * @param int               $user_id WordPress user id.
		 * @param array<int, array> $layouts Map of `site_id` => `LayoutDelta`.
		 * @return bool
		 */
		public function put_layouts( int $user_id, array $layouts ): bool;
	}
}
