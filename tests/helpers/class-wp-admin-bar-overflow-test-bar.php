<?php
/**
 * Minimal stand-in for `WP_Admin_Bar` used by the unit test suite.
 *
 * Tests instantiate this class, register a node set with `add_node`, then
 * assign the instance to the global `$wp_admin_bar` so the classifier sees
 * the test fixture on read.
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

if ( class_exists( 'WP_Admin_Bar_Overflow_Test_Bar' ) ) {
	return;
}

/**
 * Test double for `WP_Admin_Bar`. Implements only the API surface the
 * classifier touches (`add_node` + `get_nodes`).
 */
class WP_Admin_Bar_Overflow_Test_Bar {

	/**
	 * Registered nodes keyed by raw id.
	 *
	 * @var array<string, object>
	 */
	private $nodes = array();

	/**
	 * Register a node. Mirrors `WP_Admin_Bar::add_node`'s argument shape for
	 * the subset of keys the classifier reads.
	 *
	 * @param array $args Node arguments. Recognised keys: `id`, `title`,
	 *                    `parent`, `href`, `group`, `meta`.
	 */
	public function add_node( array $args ): void {
		$node                     = new stdClass();
		$node->id                 = isset( $args['id'] ) ? (string) $args['id'] : '';
		$node->title              = isset( $args['title'] ) ? (string) $args['title'] : '';
		$node->parent             = isset( $args['parent'] ) ? (string) $args['parent'] : '';
		$node->href               = isset( $args['href'] ) ? (string) $args['href'] : '';
		$node->group              = isset( $args['group'] ) ? (bool) $args['group'] : false;
		$node->meta               = isset( $args['meta'] ) && is_array( $args['meta'] ) ? $args['meta'] : array();
		$this->nodes[ $node->id ] = $node;
	}

	/**
	 * Return every registered node.
	 *
	 * @return array<string, object>
	 */
	public function get_nodes(): array {
		return $this->nodes;
	}
}
