<?php
/**
 * Builds the immutable nav model from `$wp_admin_bar`.
 *
 * Hooked at `wp_before_admin_bar_render` priority 10. The read happens AFTER
 * every `admin_bar_menu` callback has fired (including `PHP_INT_MAX`-priority
 * registrations), so the classifier sees the final node set rather than the
 * partial state visible at any single `admin_bar_menu` priority. The
 * downstream data planner reads the cached model at
 * `wp_before_admin_bar_render` priority `PHP_INT_MAX - 1`.
 *
 * Scope: parentless nodes plus nodes whose parent is `top-secondary`. The
 * classifier ignores grouped / nested nodes that live further down the tree;
 * those reach the renderer via `submenuChildren` references on their
 * top-level parent.
 *
 * Contract reference: `03-contracts.md` § 1 (ClassificationEntry), § 2
 * (NavModel), § 3 (filter signatures).
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( class_exists( 'Admin_Bar_Overflow_Classifier' ) ) {
	return;
}

/**
 * Stateless except for a per-request singleton on the most recent nav model so
 * the data planner can read it without rebuilding.
 */
class Admin_Bar_Overflow_Classifier {

	/**
	 * Per-request cached nav model. Null when the classifier has not run or
	 * when gating returned false.
	 *
	 * @var array|null
	 */
	private static $nav_model = null;

	/**
	 * Read `$wp_admin_bar`, classify each top-level node, build the nav model,
	 * cache it on the singleton.
	 */
	public static function read_and_classify(): void {
		$user_id = function_exists( 'get_current_user_id' ) ? (int) get_current_user_id() : 0;
		$enabled = (bool) apply_filters( 'wp_admin_bar_overflow_enabled', false, $user_id );
		if ( ! $enabled ) {
			return;
		}

		$nodes = self::get_nodes();
		if ( null === $nodes ) {
			return;
		}

		$registry = wp_admin_bar_overflow_default_registry();
		$registry = (array) apply_filters( 'wp_admin_bar_overflow_registry', $registry );

		$entries = array();
		foreach ( $nodes as $node ) {
			$entry = self::classify_node( $node, $registry, $nodes );
			if ( null === $entry ) {
				continue;
			}
			$entries[] = $entry;
		}

		usort(
			$entries,
			static function ( array $a, array $b ): int {
				if ( $a['priority'] !== $b['priority'] ) {
					return $a['priority'] <=> $b['priority'];
				}
				return strcmp( (string) $a['rawId'], (string) $b['rawId'] );
			}
		);

		$label = (string) apply_filters( 'wp_admin_bar_overflow_dropdown_label', 'Plugins' );

		self::$nav_model = array(
			'version'     => 1,
			'enabled'     => true,
			'nodes'       => $entries,
			'dropdown'    => array(
				'id'           => 'overflow-plugins',
				'label'        => $label,
				'emptyMessage' => function_exists( '__' )
					? __( 'No plugin nodes overflow at this viewport.', 'wp-admin-bar-overflow' )
					: 'No plugin nodes overflow at this viewport.',
			),
			'breakpoints' => array(
				'narrowDesktop' => 1280,
				'tablet'        => 782,
				'mobile'        => 600,
			),
			'flags'       => array(
				'prefersReducedMotion' => false,
				'debug'                => defined( 'WP_ADMIN_BAR_OVERFLOW_DEBUG' ) && constant( 'WP_ADMIN_BAR_OVERFLOW_DEBUG' ),
			),
		);
	}

	/**
	 * Read the cached nav model. Returns null when no model has been built.
	 */
	public static function get_nav_model(): ?array {
		return self::$nav_model;
	}

	/**
	 * Test-only reset hook. The bootstrap never calls this; tests use it to
	 * isolate cases that share a process.
	 */
	public static function reset(): void {
		self::$nav_model = null;
	}

	/**
	 * Pull the node array from `$wp_admin_bar`. Returns null when the global
	 * is unavailable (e.g., admin bar suppressed for this request).
	 *
	 * @return array<int|string, object>|null
	 */
	private static function get_nodes(): ?array {
		// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		global $wp_admin_bar;
		if ( ! is_object( $wp_admin_bar ) || ! method_exists( $wp_admin_bar, 'get_nodes' ) ) {
			return null;
		}
		$nodes = $wp_admin_bar->get_nodes();
		return is_array( $nodes ) ? $nodes : null;
	}

	/**
	 * Classify one node. Returns null for out-of-scope nodes (nested under
	 * something other than `top-secondary`) and for nodes the filter chain
	 * tags as `'skip'`.
	 *
	 * @param object $node       The `WP_Admin_Bar` node object.
	 * @param array  $registry   Active classification registry.
	 * @param array  $all_nodes  Full node map (used to compute submenuChildren).
	 */
	private static function classify_node( $node, array $registry, array $all_nodes ): ?array {
		if ( ! is_object( $node ) ) {
			return null;
		}

		$raw_id = isset( $node->id ) ? (string) $node->id : '';
		if ( '' === $raw_id ) {
			return null;
		}

		$parent = isset( $node->parent ) ? (string) $node->parent : '';
		if ( '' !== $parent && 'top-secondary' !== $parent ) {
			return null;
		}

		$entry = $registry[ $raw_id ] ?? null;

		$class = null;
		if ( is_array( $entry ) && isset( $entry['class'] ) ) {
			$class = (string) $entry['class'];
		}

		if ( null === $class ) {
			$filtered = apply_filters( 'wp_admin_bar_overflow_node_classify', null, $raw_id, $node );
			if ( is_string( $filtered ) && in_array( $filtered, array( 'core', 'wpcom', 'plugin', 'skip' ), true ) ) {
				$class = $filtered;
			}
		}

		if ( null === $class ) {
			$class = 'plugin';
		}

		if ( 'skip' === $class ) {
			return null;
		}

		$default_priority = isset( $entry['priority'] ) ? (int) $entry['priority'] : 100;
		$priority         = (int) apply_filters( 'wp_admin_bar_overflow_node_priority', $default_priority, $raw_id, $node );

		$title_raw = isset( $node->title ) ? (string) $node->title : '';
		$title     = wp_strip_all_tags( $title_raw );
		$canonical = $entry['labels']['canonical'] ?? null;
		if ( null === $canonical && '' !== $title ) {
			$canonical = $title;
		}

		$screen_reader = $entry['labels']['screen_reader'] ?? null;
		if ( is_string( $screen_reader ) ) {
			$screen_reader = wp_strip_all_tags( $screen_reader );
			if ( '' === $screen_reader ) {
				$screen_reader = null;
			}
		}

		$children = array();
		foreach ( $all_nodes as $other ) {
			if ( ! is_object( $other ) ) {
				continue;
			}
			$other_parent = isset( $other->parent ) ? (string) $other->parent : '';
			$other_id     = isset( $other->id ) ? (string) $other->id : '';
			if ( $other_parent === $raw_id && '' !== $other_id ) {
				$children[] = 'wp-admin-bar-' . $other_id;
			}
		}

		$href = isset( $node->href ) ? (string) $node->href : '';

		return array(
			'nodeId'          => 'wp-admin-bar-' . $raw_id,
			'rawId'           => $raw_id,
			'class'           => $class,
			'parent'          => '' === $parent ? null : 'wp-admin-bar-' . $parent,
			'priority'        => $priority,
			'labels'          => array(
				'canonical'     => $canonical,
				'screen_reader' => $screen_reader,
			),
			'icon'            => array(
				'kind' => 'none',
				'ref'  => null,
			),
			'badge'           => array(
				'text'      => null,
				'attention' => false,
			),
			'href'            => '' === $href ? null : $href,
			'submenuChildren' => $children,
		);
	}
}
