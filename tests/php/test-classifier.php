<?php
/**
 * Admin_Bar_Overflow_Classifier tests.
 *
 * Covers scenarios S0.1 (no PHP notices on empty bar), S0.2 (shape stability),
 * S0.2b (Core-allowlist completeness vs the checked-in fixture), S0.3 (filter
 * override), S0.4 (late-registration capture), S0.5 (`'skip'` exclusion), S0.9
 * (`reader` parent-`top-secondary` plugin classification), and S0.11 (XSS
 * safety of the data planner's emitted JSON).
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

use PHPUnit\Framework\TestCase;

final class Admin_Bar_Overflow_Classifier_Test extends TestCase {

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

	// ─── S0.1 / empty + disabled paths ────────────────────────────────────

	public function test_disabled_filter_short_circuits_classification(): void {
		remove_all_filters( 'wp_admin_bar_overflow_enabled' );
		add_filter( 'wp_admin_bar_overflow_enabled', static fn () => false );

		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'About WordPress',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$this->assertNull( Admin_Bar_Overflow_Classifier::get_nav_model() );
	}

	public function test_empty_bar_still_emits_nav_model_with_no_nodes(): void {
		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();
		$this->assertIsArray( $model );
		$this->assertSame( 1, $model['version'] );
		$this->assertTrue( $model['enabled'] );
		$this->assertSame( array(), $model['nodes'] );
		$this->assertSame( 'overflow-plugins', $model['dropdown']['id'] );
	}

	// ─── S0.2 / shape stability ───────────────────────────────────────────

	public function test_classifier_emits_full_classification_entry_shape(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'About WordPress',
				'href'  => '/wp-admin/about.php',
			)
		);
		$this->bar()->add_node(
			array(
				'id'     => 'my-account',
				'parent' => 'top-secondary',
				'title'  => 'Howdy, admin',
				'href'   => '/wp-admin/profile.php',
			)
		);
		$this->bar()->add_node(
			array(
				'id'     => 'user-info',
				'parent' => 'my-account',
				'title'  => 'admin@example.com',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$this->assertIsArray( $model );
		$ids = array_column( $model['nodes'], 'rawId' );
		// Both Core nodes share priority 0; the secondary alphabetical sort
		// puts `my-account` before `wp-logo`.
		$this->assertSame( array( 'my-account', 'wp-logo' ), $ids );
		$this->assertNotContains( 'user-info', $ids );

		$wp_logo = $this->find_entry( $model, 'wp-logo' );
		$this->assertSame(
			array(
				'nodeId',
				'rawId',
				'class',
				'parent',
				'priority',
				'labels',
				'icon',
				'badge',
				'href',
				'submenuChildren',
			),
			array_keys( $wp_logo )
		);
		$this->assertSame( 'core', $wp_logo['class'] );
		$this->assertNull( $wp_logo['parent'] );
		$this->assertSame( '/wp-admin/about.php', $wp_logo['href'] );

		$my_account = $this->find_entry( $model, 'my-account' );
		$this->assertSame( 'core', $my_account['class'] );
		$this->assertSame( 'wp-admin-bar-top-secondary', $my_account['parent'] );
		$this->assertSame( array( 'wp-admin-bar-user-info' ), $my_account['submenuChildren'] );
	}

	public function test_classifier_output_is_stable_across_identical_loads(): void {
		$seed = function (): void {
			$this->bar()->add_node(
				array(
					'id'    => 'wp-logo',
					'title' => 'About WordPress',
				)
			);
			$this->bar()->add_node(
				array(
					'id'    => 'query-monitor',
					'title' => 'Query Monitor',
				)
			);
			$this->bar()->add_node(
				array(
					'id'     => 'reader',
					'parent' => 'top-secondary',
					'title'  => 'Reader',
				)
			);
		};
		$seed();
		Admin_Bar_Overflow_Classifier::read_and_classify();
		$first = Admin_Bar_Overflow_Classifier::get_nav_model();

		Admin_Bar_Overflow_Classifier::reset();
		$GLOBALS['wp_admin_bar'] = new WP_Admin_Bar_Overflow_Test_Bar();
		$seed();
		Admin_Bar_Overflow_Classifier::read_and_classify();
		$second = Admin_Bar_Overflow_Classifier::get_nav_model();

		$this->assertSame( $first, $second );
	}

	public function test_classifier_sorts_nodes_by_priority_then_alphabetical(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'zeta-plugin',
				'title' => 'Zeta',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'alpha-plugin',
				'title' => 'Alpha',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'query-monitor',
				'title' => 'Query Monitor',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'About WordPress',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		// `wp-logo` (priority 0 from registry) sorts before plugin nodes;
		// `query-monitor` (priority 100 from registry) sorts before unknown
		// plugins (priority 100 default), with alphabetical falling back as
		// the secondary key.
		$this->assertSame(
			array( 'wp-logo', 'alpha-plugin', 'query-monitor', 'zeta-plugin' ),
			array_column( $model['nodes'], 'rawId' )
		);
	}

	// ─── S0.2b / Core-allowlist completeness ──────────────────────────────

	public function test_registry_core_set_matches_checked_in_fixture(): void {
		$fixture_path = __DIR__ . '/../fixtures/core-allowlist-expected.json';
		$this->assertFileExists( $fixture_path );

		$fixture = json_decode( (string) file_get_contents( $fixture_path ), true );
		$this->assertIsArray( $fixture );

		$expected = array();
		foreach ( $fixture as $row ) {
			$expected[ $row['id'] ] = $row['parent'];
		}
		ksort( $expected );

		$actual = array();
		foreach ( wp_admin_bar_overflow_default_registry() as $raw_id => $entry ) {
			if ( 'core' !== ( $entry['class'] ?? null ) ) {
				continue;
			}
			$actual[ $raw_id ] = (string) ( $entry['parent'] ?? '' );
		}
		ksort( $actual );

		$this->assertSame( $expected, $actual );
	}

	// ─── S0.3 / filter override ───────────────────────────────────────────

	public function test_node_classify_filter_overrides_unknown_plugin(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'custom-plugin',
				'title' => 'Custom Plugin',
			)
		);

		add_filter(
			'wp_admin_bar_overflow_node_classify',
			static function ( $class, $node_id ) {
				return 'custom-plugin' === $node_id ? 'core' : $class;
			},
			10,
			3
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'custom-plugin' );
		$this->assertSame( 'core', $entry['class'] );
	}

	public function test_node_priority_filter_overrides_default(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'custom-plugin',
				'title' => 'Custom',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);

		add_filter(
			'wp_admin_bar_overflow_node_priority',
			static function ( $priority, $node_id ) {
				return 'custom-plugin' === $node_id ? -10 : $priority;
			},
			10,
			3
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$this->assertSame(
			array( 'custom-plugin', 'wp-logo' ),
			array_column( $model['nodes'], 'rawId' )
		);
	}

	public function test_dropdown_label_filter_overrides_default(): void {
		add_filter( 'wp_admin_bar_overflow_dropdown_label', static fn () => 'Tools' );
		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();
		$this->assertSame( 'Tools', $model['dropdown']['label'] );
	}

	public function test_registry_filter_can_amend_classification(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'amended-plugin',
				'title' => 'Amended',
			)
		);

		add_filter(
			'wp_admin_bar_overflow_registry',
			static function ( $registry ) {
				$registry['amended-plugin'] = array(
					'nodeId'   => 'wp-admin-bar-amended-plugin',
					'class'    => 'core',
					'parent'   => '',
					'priority' => 5,
					'labels'   => array(
						'canonical'     => 'Amended',
						'screen_reader' => null,
					),
				);
				return $registry;
			}
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'amended-plugin' );
		$this->assertSame( 'core', $entry['class'] );
		$this->assertSame( 5, $entry['priority'] );
	}

	// ─── S0.4 / late-priority capture ─────────────────────────────────────

	public function test_node_added_late_is_captured_on_classifier_read(): void {
		// Simulates a plugin registering at `admin_bar_menu` priority
		// PHP_INT_MAX. The classifier reads on `wp_before_admin_bar_render`,
		// which fires after every `admin_bar_menu` priority — so the late
		// node is present in `get_nodes()` when the classifier runs.
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'very-late-plugin',
				'title' => 'Late',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'very-late-plugin' );
		$this->assertSame( 'plugin', $entry['class'] );
	}

	// ─── S0.5 / skip exclusion ────────────────────────────────────────────

	public function test_skip_classification_removes_node_from_output(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'skip-me',
				'title' => 'Skip Me',
			)
		);

		add_filter(
			'wp_admin_bar_overflow_node_classify',
			static function ( $class, $node_id ) {
				return 'skip-me' === $node_id ? 'skip' : $class;
			},
			10,
			3
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$this->assertSame(
			array( 'wp-logo' ),
			array_column( $model['nodes'], 'rawId' )
		);
	}

	public function test_default_registry_skips_woocommerce_site_visibility_badge(): void {
		// The WooCommerce site-visibility badge is host-essential UI and
		// should not be overflow-managed. The default registry classifies
		// it as `'skip'` so the classifier omits it from the nav model
		// entirely — the runtime then never enrolls it, leaving it inline
		// at every viewport above the mobile band.
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'woocommerce-site-visibility-badge',
				'title' => 'Store coming soon',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$ids = array_column( Admin_Bar_Overflow_Classifier::get_nav_model()['nodes'], 'rawId' );

		$this->assertContains( 'wp-logo', $ids );
		$this->assertNotContains( 'woocommerce-site-visibility-badge', $ids );
	}

	// ─── Group filter ─────────────────────────────────────────────────────

	public function test_classifier_skips_group_container_nodes(): void {
		// Core registers structural groups via `add_group()`; classifying
		// those would mark an entire container as a plugin node and hide it
		// at ≤ 782px.
		$this->bar()->add_node(
			array(
				'id'    => 'top-secondary',
				'group' => true,
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$ids = array_column( Admin_Bar_Overflow_Classifier::get_nav_model()['nodes'], 'rawId' );

		$this->assertContains( 'wp-logo', $ids );
		$this->assertNotContains( 'top-secondary', $ids );
	}

	public function test_classifier_includes_root_default_top_level_plugin_nodes(): void {
		$this->bar()->add_node(
			array(
				'id'     => 'updraft_admin_node',
				'parent' => 'root-default',
				'title'  => 'UpdraftPlus',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'updraft_admin_node' );
		$this->assertSame( 'plugin', $entry['class'] );
		$this->assertNull( $entry['parent'] );
		$this->assertSame( 'UpdraftPlus', $entry['labels']['canonical'] );
	}

	public function test_classifier_includes_visible_plugin_group_nodes(): void {
		$this->bar()->add_node(
			array(
				'id'     => 'litespeed-menu',
				'parent' => 'root-default',
				'title'  => 'LiteSpeed',
				'group'  => true,
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'litespeed-menu' );
		$this->assertSame( 'plugin', $entry['class'] );
		$this->assertNull( $entry['parent'] );
	}

	// ─── Scope filter ─────────────────────────────────────────────────────

	public function test_classifier_ignores_nodes_outside_scope(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		$this->bar()->add_node(
			array(
				'id'    => 'site-name',
				'title' => 'Site',
			)
		);
		$this->bar()->add_node(
			array(
				'id'     => 'view-site',
				'parent' => 'site-name',
				'title'  => 'Visit',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$ids = array_column( $model['nodes'], 'rawId' );
		$this->assertContains( 'site-name', $ids );
		$this->assertNotContains( 'view-site', $ids );

		$site_name = $this->find_entry( $model, 'site-name' );
		$this->assertSame( array( 'wp-admin-bar-view-site' ), $site_name['submenuChildren'] );
	}

	// ─── S0.9 / reader as plugin on self-hosted Jetpack ───────────────────

	public function test_reader_under_top_secondary_classifies_as_plugin_without_adapter(): void {
		// No host adapter is loaded; the public plugin's registry has no
		// `reader` entry, and no `node_classify` filter is bound, so the
		// default classification applies.
		$this->bar()->add_node(
			array(
				'id'     => 'reader',
				'parent' => 'top-secondary',
				'title'  => 'Reader',
				'href'   => '/reader',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$model = Admin_Bar_Overflow_Classifier::get_nav_model();

		$entry = $this->find_entry( $model, 'reader' );
		$this->assertSame( 'plugin', $entry['class'] );
		$this->assertSame( 'wp-admin-bar-top-secondary', $entry['parent'] );
	}

	// ─── S0.11 / XSS safety in the data planner emit ──────────────────────

	public function test_classifier_strips_tags_from_node_titles_before_emit(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'evil-plugin',
				'title' => 'Hi</script><img src=x onerror=alert(1)>',
			)
		);

		Admin_Bar_Overflow_Classifier::read_and_classify();
		$json = Admin_Bar_Overflow_Data_Planner::render();

		$this->assertIsString( $json );
		$this->assertStringNotContainsString( '</script>', $json );
		$this->assertStringNotContainsString( '<img', $json );
		$this->assertStringNotContainsString( 'onerror', $json );

		$model = Admin_Bar_Overflow_Classifier::get_nav_model();
		$entry = $this->find_entry( $model, 'evil-plugin' );
		$this->assertSame( 'Hi', $entry['labels']['canonical'] );
	}

	public function test_data_planner_hex_escapes_dangerous_chars_in_unstripped_fields(): void {
		// `wp_admin_bar_overflow_dropdown_label` is passed through verbatim
		// by the classifier (the filter consumer is responsible for the
		// content). The data planner's `JSON_HEX_TAG | JSON_HEX_AMP |
		// JSON_HEX_APOS | JSON_HEX_QUOT` flags guarantee that even an
		// unstripped label cannot break out of the inline `<script>` block.
		add_filter( 'wp_admin_bar_overflow_dropdown_label', static fn () => 'Pl<u>g</u>ins' );
		Admin_Bar_Overflow_Classifier::read_and_classify();
		$json = Admin_Bar_Overflow_Data_Planner::render();

		$this->assertIsString( $json );
		$this->assertStringNotContainsString( '<u>', $json );
		$this->assertStringNotContainsString( '</u>', $json );
		$this->assertStringContainsString( '\\u003C', $json );
		$this->assertStringContainsString( '\\u003E', $json );
	}

	public function test_data_planner_emits_application_json_script_tag(): void {
		$this->bar()->add_node(
			array(
				'id'    => 'wp-logo',
				'title' => 'WP',
			)
		);
		Admin_Bar_Overflow_Classifier::read_and_classify();

		ob_start();
		Admin_Bar_Overflow_Data_Planner::emit();
		$output = (string) ob_get_clean();

		$this->assertStringContainsString(
			'<script type="application/json" id="wp-admin-bar-overflow-data">',
			$output
		);
		$this->assertStringContainsString( '"nodes"', $output );
		$this->assertStringEndsWith( "</script>\n", $output );
	}

	public function test_data_planner_emits_nothing_when_no_nav_model_cached(): void {
		ob_start();
		Admin_Bar_Overflow_Data_Planner::emit();
		$this->assertSame( '', (string) ob_get_clean() );
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	private function bar(): WP_Admin_Bar_Overflow_Test_Bar {
		return $GLOBALS['wp_admin_bar'];
	}

	private function find_entry( array $nav_model, string $raw_id ): array {
		foreach ( $nav_model['nodes'] as $entry ) {
			if ( $entry['rawId'] === $raw_id ) {
				return $entry;
			}
		}
		$this->fail( "No entry with rawId={$raw_id} in nav model." );
	}
}
