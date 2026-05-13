<?php
/**
 * Plugin Name:       WP Admin Bar Overflow
 * Plugin URI:        https://github.com/Automattic/wp-admin-bar-overflow
 * Description:       Responsive overflow for plugin-added WordPress admin-bar nodes. Plugin nodes that don't fit at narrow viewports overflow into a right-side Plugins dropdown; on tablet and mobile, all plugin nodes group under the dropdown unconditionally. The original DOM nodes stay in place at their registered positions and click events forward to them, so plugin JavaScript that binds to specific node IDs continues to work. Per-user opt-in via the `wp_admin_bar_overflow_enabled` filter; activating the plugin is the opt-in signal on plain WordPress installs.
 * Version:           0.1.0-alpha
 * Requires at least: 6.5
 * Requires PHP:      8.0
 * Author:            Christos Koumenides, Lucas Mendes
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-admin-bar-overflow
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ─── Constants ─────────────────────────────────────────────────────────────
define( 'WP_ADMIN_BAR_OVERFLOW_VERSION', '0.1.0-alpha' );
define( 'WP_ADMIN_BAR_OVERFLOW_FILE', __FILE__ );
define( 'WP_ADMIN_BAR_OVERFLOW_DIR', plugin_dir_path( __FILE__ ) );
define( 'WP_ADMIN_BAR_OVERFLOW_URL', plugin_dir_url( __FILE__ ) );

// ─── Mid-deploy / partial-load safety ──────────────────────────────────────
// Verify all required files are present before requiring them. Defensive
// against rsync-style deploys where files land in non-deterministic order
// (so this top-level bootstrap can briefly be live before its required
// /src/ companions arrive). Cheap to do; protects against fatal mid-deploy.
//
// The required-files list is empty in this initial scaffold and is populated
// as the classifier, registry, data planner, and storage layer land in
// subsequent PRs.
$wp_admin_bar_overflow_required_files = array();
foreach ( $wp_admin_bar_overflow_required_files as $wp_admin_bar_overflow_required_file ) {
	if ( ! file_exists( $wp_admin_bar_overflow_required_file ) ) {
		unset( $wp_admin_bar_overflow_required_files, $wp_admin_bar_overflow_required_file );
		return;
	}
}
unset( $wp_admin_bar_overflow_required_files );
if ( isset( $wp_admin_bar_overflow_required_file ) ) {
	unset( $wp_admin_bar_overflow_required_file );
}

// ─── Default enablement gate ───────────────────────────────────────────────
//
// Default predicate on plain WordPress: enabled for any logged-in user. The
// install IS the opt-in signal — activating the plugin enables the redesign
// for everyone on the site. Hosts that need finer control (per-blog, per-user,
// percentage rollout) override by binding the `wp_admin_bar_overflow_enabled`
// filter from a host adapter.
//
// Two control levers ship in-tree for development convenience:
//
//   define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED', true );  // kill switch
//   define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED',  true );  // bypass gate
//
// Both levers short-circuit at the start of the filter chain so they win over
// any host-adapter binding.
add_filter(
	'wp_admin_bar_overflow_enabled',
	static function ( $enabled, $user_id ) {
		if ( defined( 'WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED' ) && WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED ) {
			return false;
		}
		if ( defined( 'WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED' ) && WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED ) {
			return true;
		}
		// Logged-in users get the overflow behaviour; logged-out / cron / cli
		// requests do not. The admin bar itself only renders for logged-in
		// users, so this is belt-and-braces.
		return (bool) $user_id;
	},
	10,
	2
);

// ─── Deactivation cleanup ──────────────────────────────────────────────────
//
// Data-preserving deactivation: nothing to clean up at v0.1.x (the plugin is
// read-only — no user state is persisted). The hook is registered so future
// versions that add storage can clean up here, with a deprecation cycle if the
// cleanup behaviour ever needs to change.
register_deactivation_hook(
	WP_ADMIN_BAR_OVERFLOW_FILE,
	static function () {
		// Intentional no-op at v0.1.x.
	}
);
