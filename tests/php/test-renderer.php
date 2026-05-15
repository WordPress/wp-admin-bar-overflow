<?php
/**
 * Admin_Bar_Overflow_Renderer tests.
 *
 * Covers the A.1 entry-checkpoint placeholder-shell rendering gate (item 6 in
 * `06-phases.md` § Milestone A.1 Entry checkpoint): trigger anchor + placeholder
 * child group + placeholder child node + inline placeholder-hide style block +
 * Closure::bind reorder that places the trigger before the first id in
 * `wp_admin_bar_overflow_trigger_insert_before_ids` that exists.
 *
 * Scenarios: S1.21 (placeholder-shell rendering), and the reorder semantics
 * from the renderer work item in `06-phases.md` § A.1.
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

use PHPUnit\Framework\TestCase;

final class Admin_Bar_Overflow_Renderer_Test extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Admin_Bar_Overflow_Classifier::reset();
		remove_all_filters();
		$GLOBALS['__wpabo_user_id'] = 1;
		add_filter(
			'wp_admin_bar_overflow_enabled',
			static fn ( $enabled, $user_id ) => (bool) $user_id,
			10,
			2
		);
		$GLOBALS['wp_admin_bar'] = new WP_Admin_Bar_Overflow_Test_Bar();
	}

	protected function tearDown(): void {
		Admin_Bar_Overflow_Classifier::reset();
		remove_all_filters();
		unset( $GLOBALS['wp_admin_bar'], $GLOBALS['__wpabo_user_id'] );
		parent::tearDown();
	}

	// ─── Gating ───────────────────────────────────────────────────────────

	public function test_renderer_is_noop_when_classifier_did_not_run(): void {
		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		$output = (string) ob_get_clean();

		$this->assertSame( '', $output );
		$this->assertSame( array(), $this->bar()->get_nodes() );
	}

	public function test_renderer_is_noop_when_no_plugin_classified_nodes(): void {
		// Only a Core node — no plugin-classified entries — so the renderer
		// must not register the trigger.
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'About WordPress',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		$output = (string) ob_get_clean();

		$this->assertSame( '', $output );
		$nodes = $this->bar()->get_nodes();
		$this->assertArrayNotHasKey( 'overflow-plugins', $nodes );
		$this->assertArrayNotHasKey( 'overflow-placeholder', $nodes );
	}

	// ─── Trigger + placeholder registration ───────────────────────────────

	public function test_renderer_registers_trigger_with_anchor_shape(): void {
		$this->seed_classifier_with_one_plugin_node();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$nodes   = $this->bar()->get_nodes();
		$trigger = $nodes['overflow-plugins'] ?? null;

		$this->assertNotNull( $trigger, 'trigger node should be registered' );
		$this->assertSame( 'top-secondary', $trigger->parent );
		$this->assertSame( '#', $trigger->href );
		$this->assertSame( 'return false;', $trigger->meta['onclick'] ?? null );
		$this->assertStringContainsString( 'wp-admin-bar-overflow-trigger', (string) ( $trigger->meta['class'] ?? '' ) );
		$this->assertFalse( (bool) $trigger->group );
	}

	public function test_renderer_uses_dropdown_label_for_trigger_title(): void {
		add_filter( 'wp_admin_bar_overflow_dropdown_label', static fn () => 'Tools & Plugins' );
		$this->seed_classifier_with_one_plugin_node();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$nodes = $this->bar()->get_nodes();
		$this->assertSame( '<span class="screen-reader-text">Tools &amp; Plugins</span>', $nodes['overflow-plugins']->title );
	}

	public function test_renderer_registers_placeholder_group_and_child(): void {
		$this->seed_classifier_with_one_plugin_node();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$nodes = $this->bar()->get_nodes();

		$group = $nodes['overflow-plugins-default'] ?? null;
		$this->assertNotNull( $group, 'placeholder group should be registered' );
		$this->assertSame( 'overflow-plugins', $group->parent );
		$this->assertTrue( $group->group );

		$placeholder = $nodes['overflow-placeholder'] ?? null;
		$this->assertNotNull( $placeholder, 'placeholder child should be registered' );
		$this->assertSame( 'overflow-plugins-default', $placeholder->parent );
		$this->assertSame( '', $placeholder->href );
		$this->assertStringContainsString(
			'wp-admin-bar-overflow-placeholder',
			(string) ( $placeholder->meta['class'] ?? '' )
		);
	}

	// ─── Inline placeholder-hide style ────────────────────────────────────

	public function test_renderer_emits_inline_placeholder_hide_style_block(): void {
		$this->seed_classifier_with_one_plugin_node();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		$output = (string) ob_get_clean();

		$this->assertStringContainsString(
			'<style id="wp-admin-bar-overflow-runtime-style">',
			$output
		);
		$this->assertStringContainsString(
			'.wp-admin-bar-overflow-placeholder{display:none}',
			$output
		);
		$this->assertStringEndsWith( "</style>\n", $output );
	}

	public function test_renderer_emits_no_style_block_when_no_plugin_nodes(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		$output = (string) ob_get_clean();

		$this->assertSame( '', $output );
	}

	// ─── Runtime JS emission ──────────────────────────────────────────────

	public function test_emit_runtime_js_is_noop_when_classifier_did_not_run(): void {
		ob_start();
		Admin_Bar_Overflow_Renderer::emit_runtime_js();
		$this->assertSame( '', (string) ob_get_clean() );
	}

	public function test_emit_runtime_js_is_noop_when_no_plugin_classified_nodes(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::emit_runtime_js();
		$this->assertSame( '', (string) ob_get_clean() );
	}

	// ─── Reorder closure ──────────────────────────────────────────────────

	public function test_reorder_moves_trigger_before_my_account(): void {
		// Seed the bar with `my-account` first, then a plugin node, so the
		// trigger naturally lands AFTER `my-account` without the reorder.
		$this->bar()->add_node(
			array(
				'id'     => 'my-account',
				'parent' => 'top-secondary',
				'title'  => 'Howdy',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'query-monitor',
				'title' => 'Query Monitor',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$ids = array_keys( $this->bar()->get_nodes() );
		$this->assertContains( 'overflow-plugins', $ids );
		$this->assertContains( 'my-account', $ids );
		$this->assertLessThan(
			array_search( 'my-account', $ids, true ),
			array_search( 'overflow-plugins', $ids, true ),
			'trigger must sit BEFORE my-account in node insertion order'
		);
	}

	public function test_reorder_uses_first_present_id_from_filter(): void {
		// Adapter-style filter: prefers `notes` over `my-account`.
		add_filter(
			'wp_admin_bar_overflow_trigger_insert_before_ids',
			static fn () => array( 'notes', 'help-center', 'my-account' )
		);

		$this->bar()->add_node(
			array(
				'id'     => 'notes',
				'parent' => 'top-secondary',
				'title'  => 'Notes',
			)
		);
		$this->bar()->add_node(
			array(
				'id'     => 'my-account',
				'parent' => 'top-secondary',
				'title'  => 'Howdy',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'query-monitor',
				'title' => 'Query Monitor',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$ids = array_keys( $this->bar()->get_nodes() );
		$this->assertLessThan(
			array_search( 'notes', $ids, true ),
			array_search( 'overflow-plugins', $ids, true ),
			'trigger must sit BEFORE notes when notes is the first present id in the filter list'
		);
		// And BEFORE my-account too, since it was inserted before notes.
		$this->assertLessThan(
			array_search( 'my-account', $ids, true ),
			array_search( 'overflow-plugins', $ids, true )
		);
	}

	public function test_reorder_no_ops_when_no_target_id_exists(): void {
		// No matching anchor on the bar; trigger stays at the tail.
		$this->bar()->add_node(
			array(
				'id'    => 'query-monitor',
				'title' => 'Query Monitor',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Renderer::register();
		ob_end_clean();

		$nodes = $this->bar()->get_nodes();
		$this->assertArrayHasKey( 'overflow-plugins', $nodes );
		// query-monitor was first; trigger came after. No reorder happens.
		$ids = array_keys( $nodes );
		$this->assertLessThan(
			array_search( 'overflow-plugins', $ids, true ),
			array_search( 'query-monitor', $ids, true )
		);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	private function bar(): WP_Admin_Bar_Overflow_Test_Bar {
		return $GLOBALS['wp_admin_bar'];
	}

	private function seed_classifier_with_one_plugin_node(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'query-monitor',
				'title' => 'Query Monitor',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();
	}
}
