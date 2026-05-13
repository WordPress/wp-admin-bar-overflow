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

// Constants.
define( 'WP_ADMIN_BAR_OVERFLOW_VERSION', '0.1.0-alpha' );
define( 'WP_ADMIN_BAR_OVERFLOW_FILE', __FILE__ );
define( 'WP_ADMIN_BAR_OVERFLOW_DIR', plugin_dir_path( __FILE__ ) );
define( 'WP_ADMIN_BAR_OVERFLOW_URL', plugin_dir_url( __FILE__ ) );

// Verify all required files are present before requiring them. Defensive
// against rsync-style deploys where files land in non-deterministic order, so
// this top-level bootstrap can briefly be live before its required /src/
// companions arrive. Cheap to do; protects against fatal mid-deploy.
$wp_admin_bar_overflow_required_files = array(
	__DIR__ . '/src/interface-admin-bar-overflow-storage.php',
	__DIR__ . '/src/class-admin-bar-overflow-user-meta-storage.php',
	__DIR__ . '/src/registry.php',
	__DIR__ . '/src/class-admin-bar-overflow-classifier.php',
	__DIR__ . '/src/class-admin-bar-overflow-data-planner.php',
);
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

require_once __DIR__ . '/src/interface-admin-bar-overflow-storage.php';
require_once __DIR__ . '/src/class-admin-bar-overflow-user-meta-storage.php';
require_once __DIR__ . '/src/registry.php';
require_once __DIR__ . '/src/class-admin-bar-overflow-classifier.php';
require_once __DIR__ . '/src/class-admin-bar-overflow-data-planner.php';

// Default enablement gate.
//
// On plain WordPress, activating the plugin IS the opt-in signal: the filter
// returns true for any logged-in user. Hosts that need finer control
// (per-blog, per-user, percentage rollout) override via a host adapter.
//
// Two control levers ship in-tree for development convenience:
//
// define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED', true ); // kill switch
// define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED',  true ); // bypass gate
//
// Both short-circuit at the start of the filter chain so they win over any
// host-adapter binding.
add_filter(
	'wp_admin_bar_overflow_enabled',
	static function ( $enabled, $user_id ) {
		if ( defined( 'WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED' ) && WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED ) {
			return false;
		}
		if ( defined( 'WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED' ) && WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED ) {
			return true;
		}
		return (bool) $user_id;
	},
	10,
	2
);

// Hook the data pipeline.
//
// Priority 10: classifier reads `$wp_admin_bar->get_nodes()` after every
// `admin_bar_menu` callback has fired (including PHP_INT_MAX-priority
// registrations) and builds the cached nav model.
//
// Priority PHP_INT_MAX - 1: data planner emits the cached nav model as
// `<script type="application/json" id="wp-admin-bar-overflow-data">`. Late
// priority leaves room for renderers / late mutators on the same hook.
add_action( 'wp_before_admin_bar_render', array( Admin_Bar_Overflow_Classifier::class, 'read_and_classify' ), 10 );
add_action( 'wp_before_admin_bar_render', array( Admin_Bar_Overflow_Data_Planner::class, 'emit' ), PHP_INT_MAX - 1 );

// Deactivation cleanup.
//
// Data-preserving deactivation: nothing to clean up at v0.1.x (the plugin is
// read-only; no user state persisted). The hook is registered so future
// versions that add storage can clean up here, with a deprecation cycle if
// the cleanup behaviour ever needs to change.
register_deactivation_hook(
	WP_ADMIN_BAR_OVERFLOW_FILE,
	static function () {
		// Intentional no-op at v0.1.x.
	}
);
