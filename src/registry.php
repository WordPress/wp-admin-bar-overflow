<?php
/**
 * Curated default classification registry.
 *
 * Source of truth for the Core allowlist (`class => 'core'`) and the seed set
 * of plugin priority hints (`class => 'plugin'` plus a default priority for
 * the dropdown ordering). The classifier reads this map before falling
 * through to the `wp_admin_bar_overflow_node_classify` filter, then to the
 * default `'plugin'` classification.
 *
 * Scope: parentless ids plus `parent='top-secondary'` ids. The Core allowlist
 * here MUST match the checked-in fixture at
 * `tests/fixtures/core-allowlist-expected.json` (id set + parents). Updates
 * to the required WordPress version that change Core's admin-bar
 * registrations require updating both this map and the fixture in the same
 * pull request.
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( ! function_exists( 'wp_admin_bar_overflow_default_registry' ) ) {

	/**
	 * Return the curated default classification registry, keyed by raw node id
	 * (the id without the `wp-admin-bar-` prefix).
	 *
	 * Entry shape:
	 *
	 *   array(
	 *       'nodeId'   => string,       // 'wp-admin-bar-<id>'
	 *       'class'    => 'core' | 'wpcom' | 'plugin' | 'skip',
	 *       'parent'   => '' | 'top-secondary',
	 *       'priority' => int,          // default 100; lower wins
	 *       'labels'   => array(
	 *           'canonical'     => ?string,
	 *           'screen_reader' => ?string,
	 *       ),
	 *   )
	 *
	 * @return array<string, array{nodeId: string, class: string, parent: string, priority: int, labels: array{canonical: ?string, screen_reader: ?string}}>
	 */
	function wp_admin_bar_overflow_default_registry(): array {

		$core = array(
			// Parentless Core nodes.
			array(
				'id'     => 'wp-logo',
				'parent' => '',
				'label'  => 'About WordPress',
			),
			array(
				'id'     => 'site-name',
				'parent' => '',
				'label'  => 'Site name',
			),
			array(
				'id'     => 'site-editor',
				'parent' => '',
				'label'  => 'Edit site',
			),
			array(
				'id'     => 'customize',
				'parent' => '',
				'label'  => 'Customize',
			),
			array(
				'id'     => 'my-sites',
				'parent' => '',
				'label'  => 'My Sites',
			),
			array(
				'id'     => 'command-palette',
				'parent' => '',
				'label'  => 'Command palette',
			),
			array(
				'id'     => 'new-content',
				'parent' => '',
				'label'  => 'New',
			),
			array(
				'id'     => 'comments',
				'parent' => '',
				'label'  => 'Comments',
			),
			array(
				'id'     => 'updates',
				'parent' => '',
				'label'  => 'Updates',
			),
			array(
				'id'     => 'menu-toggle',
				'parent' => '',
				'label'  => 'Menu',
			),

			// `top-secondary`-parented Core nodes. `my-account` is the stable
			// anchor (always present in normal admin context); `search` and
			// `recovery-mode` are conditional.
			array(
				'id'     => 'my-account',
				'parent' => 'top-secondary',
				'label'  => 'My account',
			),
			array(
				'id'     => 'search',
				'parent' => 'top-secondary',
				'label'  => 'Search',
			),
			array(
				'id'     => 'recovery-mode',
				'parent' => 'top-secondary',
				'label'  => 'Recovery mode',
			),
		);

		$registry = array();
		foreach ( $core as $entry ) {
			$registry[ $entry['id'] ] = array(
				'nodeId'   => 'wp-admin-bar-' . $entry['id'],
				'class'    => 'core',
				'parent'   => $entry['parent'],
				'priority' => 0,
				'labels'   => array(
					'canonical'     => $entry['label'],
					'screen_reader' => null,
				),
			);
		}

		// Seed plugin priority hints for the F1 fixture set. The classifier
		// uses these as priority defaults when a plugin's admin-bar node id
		// matches; the `wp_admin_bar_overflow_node_priority` filter overrides.
		$plugins = array(
			array(
				'id'       => 'query-monitor',
				'parent'   => '',
				'priority' => 100,
				'label'    => 'Query Monitor',
			),
			array(
				'id'       => 'wpseo-menu',
				'parent'   => '',
				'priority' => 110,
				'label'    => 'Yoast SEO',
			),
			array(
				'id'       => 'jetpack-scan-notice',
				'parent'   => 'top-secondary',
				'priority' => 120,
				'label'    => 'Jetpack Scan',
			),
			array(
				'id'       => 'stats',
				'parent'   => '',
				'priority' => 130,
				'label'    => 'Jetpack Stats',
			),
		);

		foreach ( $plugins as $entry ) {
			$registry[ $entry['id'] ] = array(
				'nodeId'   => 'wp-admin-bar-' . $entry['id'],
				'class'    => 'plugin',
				'parent'   => $entry['parent'],
				'priority' => $entry['priority'],
				'labels'   => array(
					'canonical'     => $entry['label'],
					'screen_reader' => null,
				),
			);
		}

		// Host-essential nodes that look like plugins to the classifier but
		// surface load-bearing state and should not be overflow-managed.
		// `'skip'` short-circuits the classifier so the runtime never enrolls
		// them; host CSS (or the responsive sheet) handles narrow viewports.
		$skip = array(
			array(
				'id'     => 'woocommerce-site-visibility-badge',
				'parent' => '',
				'label'  => 'WooCommerce site visibility',
			),
		);

		foreach ( $skip as $entry ) {
			$registry[ $entry['id'] ] = array(
				'nodeId'   => 'wp-admin-bar-' . $entry['id'],
				'class'    => 'skip',
				'parent'   => $entry['parent'],
				'priority' => 0,
				'labels'   => array(
					'canonical'     => $entry['label'],
					'screen_reader' => null,
				),
			);
		}

		return $registry;
	}
}
