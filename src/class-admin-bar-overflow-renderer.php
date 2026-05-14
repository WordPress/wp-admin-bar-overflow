<?php
/**
 * Registers the right-side Plugins dropdown trigger + placeholder shell.
 *
 * Hooked at `wp_before_admin_bar_render` priority 20 — after the classifier
 * (priority 10) caches the nav model and before the data planner
 * (`PHP_INT_MAX - 1`) emits the JSON. The renderer is a no-op when the
 * classifier did not run, when no plugin-classified nodes exist on this
 * request, or when `$wp_admin_bar` is unavailable.
 *
 * When at least one plugin-classified node exists, the renderer:
 *
 * (a) Registers the trigger node at `parent='top-secondary'` with
 *     `href='#'` + `meta['onclick']='return false;'` so Core's
 *     `_render_item()` emits the `<a class="ab-item" href="#" onclick="return false;">`
 *     anchor (Core's `<a>` branch fires when `$has_link` is true; see
 *     `wp-includes/class-wp-admin-bar.php:580-585`). The anchor is the first
 *     descendant `<a>` of the `.menupop` `<li>`, so Core's
 *     `addClass`/`removeClass` at `wp-includes/js/admin-bar.js:292-345` flip
 *     `aria-expanded` on the trigger itself (Codex round-5 F1).
 *
 * (b) Registers the placeholder child group `overflow-plugins-default` so the
 *     parent `<li>` carries the `menupop` class. Core's `_render_item()` only
 *     emits the `menupop` + `aria-expanded='false'` + `.ab-sub-wrapper`
 *     shell when `! empty( $node->children )` (Codex round-2 F5;
 *     `wp-includes/class-wp-admin-bar.php:547,560-562,608-609`).
 *
 * (c) Registers the placeholder child node `overflow-placeholder` (no `href`
 *     so Core emits `<div class='ab-item ab-empty-item'>`, lives inside
 *     `.ab-sub-wrapper` AFTER the trigger anchor in document order).
 *
 * (d) Prints an inline `<style id="wp-admin-bar-overflow-runtime-style">`
 *     block containing `.wp-admin-bar-overflow-placeholder { display: none }`
 *     so the placeholder never paints. Inline CSS, not an inline
 *     `style="..."` attribute on the `<li>`, because `_render_item()` only
 *     passes through a closed allowlist of meta keys (`onclick`, `target`,
 *     `title`, `rel`, `lang`, `dir`).
 *
 * (e) Runs a `Closure::bind` reorder closure to move the trigger before the
 *     first id in `apply_filters( 'wp_admin_bar_overflow_trigger_insert_before_ids', [ 'my-account' ] )`
 *     that is present in `$wp_admin_bar->_nodes[]`. Without the reorder,
 *     `WP_Admin_Bar::_bind()` builds `children[]` in `$_nodes`-insertion
 *     order, which would place the trigger after every existing right-side
 *     node. Pattern modelled on `omnibar.php:570-600`'s
 *     `omnibar_move_to_first_under()`. Uses `get_class( $wp_admin_bar )` as
 *     the scope so the closure works against both Core's `WP_Admin_Bar` and
 *     the test double `WP_Admin_Bar_Overflow_Test_Bar`.
 *
 * Contract reference: `03-contracts.md` § 8 (DOM shapes), § 3 (filter
 * signatures); `06-phases.md` § Milestone A.1 work item 1.
 *
 * @package WP_Admin_Bar_Overflow
 */

if ( ! defined( 'ABSPATH' ) ) {
	return;
}

if ( class_exists( 'Admin_Bar_Overflow_Renderer' ) ) {
	return;
}

/**
 * Stateless registrar for the Plugins dropdown trigger + placeholder shell.
 * Reads the cached nav model from `Admin_Bar_Overflow_Classifier` and only
 * emits markup when at least one plugin-classified node exists.
 */
class Admin_Bar_Overflow_Renderer {

	const TRIGGER_RAW_ID         = 'overflow-plugins';
	const PLACEHOLDER_GROUP      = 'overflow-plugins-default';
	const PLACEHOLDER_RAW_ID     = 'overflow-placeholder';
	const TRIGGER_CLASS          = 'wp-admin-bar-overflow-trigger';
	const PLACEHOLDER_CLASS      = 'wp-admin-bar-overflow-placeholder';
	const STYLE_ELEMENT_ID       = 'wp-admin-bar-overflow-runtime-style';
	const RUNTIME_CSS_ELEMENT_ID = 'wp-admin-bar-overflow-runtime-css';
	const RUNTIME_JS_ELEMENT_ID  = 'wp-admin-bar-overflow-runtime-js';

	/**
	 * Register the trigger + placeholder, emit the inline placeholder-hide
	 * style block, and reorder the trigger before the configured anchor id.
	 *
	 * Reads the cached nav model from `Admin_Bar_Overflow_Classifier`. No-op
	 * when no plugin-classified nodes exist.
	 */
	public static function register(): void {
		$nav_model = Admin_Bar_Overflow_Classifier::get_nav_model();
		if ( null === $nav_model ) {
			return;
		}
		if ( ! self::has_plugin_node( $nav_model ) ) {
			return;
		}

		// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		global $wp_admin_bar;
		if ( ! is_object( $wp_admin_bar ) || ! method_exists( $wp_admin_bar, 'add_node' ) ) {
			return;
		}

		$label = isset( $nav_model['dropdown']['label'] ) ? (string) $nav_model['dropdown']['label'] : 'Plugins';

		// (a) Trigger anchor.
		$wp_admin_bar->add_node(
			array(
				'id'     => self::TRIGGER_RAW_ID,
				'title'  => $label,
				'parent' => 'top-secondary',
				'href'   => '#',
				'meta'   => array(
					'onclick' => 'return false;',
					'class'   => self::TRIGGER_CLASS,
				),
			)
		);

		// (b) Placeholder child group — exists so Core's `_render_item()`
		// sees `! empty( $node->children )` for the trigger and emits the
		// `menupop` shell + `.ab-sub-wrapper`.
		$wp_admin_bar->add_node(
			array(
				'id'     => self::PLACEHOLDER_GROUP,
				'parent' => self::TRIGGER_RAW_ID,
				'group'  => true,
			)
		);

		// (c) Placeholder child node — hidden by the inline CSS rule
		// emitted below. The runtime removes it on first real-mirror inject.
		$wp_admin_bar->add_node(
			array(
				'id'     => self::PLACEHOLDER_RAW_ID,
				'parent' => self::PLACEHOLDER_GROUP,
				'title'  => '',
				'meta'   => array(
					'class' => self::PLACEHOLDER_CLASS,
				),
			)
		);

		// (d) Inline placeholder-hide style.
		echo '<style id="' . esc_attr( self::STYLE_ELEMENT_ID ) . '">.' . esc_attr( self::PLACEHOLDER_CLASS ) . '{display:none}</style>' . "\n";

		// (d') Inline runtime CSS bundle. Emitted alongside the placeholder
		// rule so the dropdown trigger paints with its intended styling on
		// first render. Skipped when the bundle is missing (pre-build
		// development install).
		self::emit_runtime_css();

		// (e) Reorder closure.
		$insert_before = (array) apply_filters(
			'wp_admin_bar_overflow_trigger_insert_before_ids',
			array( 'my-account' )
		);
		self::reorder_trigger_before( $wp_admin_bar, self::TRIGGER_RAW_ID, $insert_before );
	}

	/**
	 * Emit the runtime JS bundle after the admin bar's HTML has been
	 * rendered (so `#wpadminbar` is in the DOM). No-op when no plugin
	 * nodes were classified on this request, or when the build artefact is
	 * missing.
	 *
	 * Hooked at `wp_after_admin_bar_render` from the plugin bootstrap.
	 */
	public static function emit_runtime_js(): void {
		$nav_model = Admin_Bar_Overflow_Classifier::get_nav_model();
		if ( null === $nav_model ) {
			return;
		}
		if ( ! self::has_plugin_node( $nav_model ) ) {
			return;
		}
		$path = self::dist_path( 'runtime.js' );
		if ( null === $path ) {
			return;
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$js = file_get_contents( $path );
		if ( false === $js || '' === $js ) {
			return;
		}
		echo '<script id="' . esc_attr( self::RUNTIME_JS_ELEMENT_ID ) . '">';
		// IIFE bundle output; safe to print verbatim — esbuild minified ASCII.
		echo $js; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo "</script>\n";
	}

	/**
	 * Emit the runtime CSS bundle inline. Called from `register()` so the
	 * CSS lands before `<div id="wpadminbar">` in the document output.
	 */
	private static function emit_runtime_css(): void {
		$path = self::dist_path( 'runtime.css' );
		if ( null === $path ) {
			return;
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$css = file_get_contents( $path );
		if ( false === $css || '' === $css ) {
			return;
		}
		echo '<style id="' . esc_attr( self::RUNTIME_CSS_ELEMENT_ID ) . '">';
		echo $css; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo "</style>\n";
	}

	/**
	 * Return the absolute path to a built asset under `dist/`, or null when
	 * the file is missing. Resolves relative to the plugin root so the
	 * function works both under the live plugin and in the test harness.
	 *
	 * @param string $name Asset filename (e.g., `runtime.js`).
	 */
	private static function dist_path( string $name ): ?string {
		$base = defined( 'WP_ADMIN_BAR_OVERFLOW_DIR' )
			? rtrim( constant( 'WP_ADMIN_BAR_OVERFLOW_DIR' ), '/\\' )
			: dirname( __DIR__ );
		$path = $base . '/dist/' . $name;
		return file_exists( $path ) ? $path : null;
	}

	/**
	 * True iff the cached nav model contains at least one plugin-classified
	 * entry.
	 *
	 * @param array $nav_model Cached classifier output.
	 */
	private static function has_plugin_node( array $nav_model ): bool {
		if ( empty( $nav_model['nodes'] ) || ! is_array( $nav_model['nodes'] ) ) {
			return false;
		}
		foreach ( $nav_model['nodes'] as $entry ) {
			if ( is_array( $entry ) && 'plugin' === ( $entry['class'] ?? '' ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Move the trigger node so it sits before the first present id in
	 * `$insert_before_raw_ids` inside `$wp_admin_bar->_nodes[]`. No-op when
	 * none of the candidate ids are registered.
	 *
	 * Uses `Closure::bind` scoped to `get_class( $wp_admin_bar )` so the
	 * closure can reach the private `$nodes` property on either the real
	 * `WP_Admin_Bar` or the test double.
	 *
	 * @param object   $wp_admin_bar          The admin bar instance.
	 * @param string   $trigger_raw_id        The raw id of the trigger node.
	 * @param string[] $insert_before_raw_ids Ordered list of candidate anchor ids.
	 */
	private static function reorder_trigger_before( $wp_admin_bar, string $trigger_raw_id, array $insert_before_raw_ids ): void {
		$scope_class = get_class( $wp_admin_bar );
		if ( ! property_exists( $scope_class, 'nodes' ) ) {
			return;
		}

		$reorder = Closure::bind(
			function () use ( $trigger_raw_id, $insert_before_raw_ids ): void {
				if ( ! isset( $this->nodes[ $trigger_raw_id ] ) ) {
					return;
				}

				$target = null;
				foreach ( $insert_before_raw_ids as $candidate ) {
					$candidate = (string) $candidate;
					if ( '' !== $candidate && isset( $this->nodes[ $candidate ] ) ) {
						$target = $candidate;
						break;
					}
				}
				if ( null === $target ) {
					return;
				}

				$node = $this->nodes[ $trigger_raw_id ];
				unset( $this->nodes[ $trigger_raw_id ] );

				$reordered = array();
				$inserted  = false;
				foreach ( $this->nodes as $id => $existing ) {
					if ( ! $inserted && $id === $target ) {
						$reordered[ $trigger_raw_id ] = $node;
						$inserted                     = true;
					}
					$reordered[ $id ] = $existing;
				}
				if ( ! $inserted ) {
					$reordered[ $trigger_raw_id ] = $node;
				}
				$this->nodes = $reordered;
			},
			$wp_admin_bar,
			$scope_class
		);
		$reorder();
	}
}
