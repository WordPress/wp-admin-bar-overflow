<?php
/**
 * Source-boundary grep gate.
 *
 * Fails the build if any host-system token or host-owned node-id literal
 * appears under `/src/`. The `/src/` directory is the portable plugin source;
 * host-specific function calls, constants, or node-id strings must live in a
 * host adapter that hooks the documented filter API.
 *
 * Two leak classes are checked:
 *
 *   1. Host-system tokens (literal substring match) — function names,
 *      constants, and class-namespace prefixes that only exist on a
 *      specific host (e.g. WordPress.com / Atomic). These leak host
 *      coupling into otherwise portable source.
 *
 *   2. Host-owned admin-bar node IDs (regex match) — when the trigger's
 *      insertion target is resolved, the public-plugin renderer must call
 *      `apply_filters( 'wp_admin_bar_overflow_trigger_insert_before_ids',
 *      array( 'my-account' ) )` rather than naming host-specific IDs
 *      directly. The regex catches single + double quote variants, the
 *      `wp-admin-bar-` prefix form, and PHP variable-assignment context.
 *
 * Run: `php tests/test-grep-no-wpcom-tokens.php`
 * Exit code: 0 = clean. Non-zero = at least one violation; build should fail.
 *
 * @package WP_Admin_Bar_Overflow\Tests
 */

// CLI-only script: WordPress.Security.EscapeOutput is for HTML browser output, not stdout.
// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped, Squiz.Strings.DoubleQuoteUsage.NotRequired

$host_system_tokens = array(
	'calypso_preferences',
	'flush_cache_user_connected',
	'get_user_attribute',
	'has_blog_sticker',
	'is_blog_atomic',
	'IS_WPCOM',
	'is_woa_site',
	'is_wpcom_simple',
	'jetpack_connected_user_data',
	'show_unified_nav',
	'update_user_attribute',
	'wpcom_admin_interface',
);

// Host-owned admin-bar IDs the renderer must NOT name directly. The host's
// adapter prepends them through `wp_admin_bar_overflow_trigger_insert_before_ids`.
// `my-account` stays allowed: it is Core's stable `top-secondary` anchor and
// the public-plugin default.
//
// Patterns:
// (A) quoted id literals (single or double quote)
// (B) full `wp-admin-bar-<id>` prefix form (single or double quote)
// (C) id literal as the right-hand side of a PHP variable assignment
$host_node_id_patterns = array(
	"/['\"](?:notes|help-center|reader|cart)['\"]/",
	"/['\"]wp-admin-bar-(?:notes|help-center|reader|cart)['\"]/",
	'/\\$\\w+\\s*=\\s*[\'"](?:notes|help-center|reader|cart)[\'"]/',
);

$src_dir = dirname( __DIR__ ) . '/src';
if ( ! is_dir( $src_dir ) ) {
	fwrite( STDERR, "src dir not found: {$src_dir}\n" );
	exit( 2 );
}

$found = array();

$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $src_dir ) );
foreach ( $iterator as $file ) {
	if ( ! $file->isFile() ) {
		continue;
	}

	$ext = $file->getExtension();
	if ( 'php' !== $ext && 'js' !== $ext && 'ts' !== $ext && 'tsx' !== $ext && 'css' !== $ext && 'scss' !== $ext ) {
		continue;
	}

	$contents = file_get_contents( $file->getPathname() );
	if ( false === $contents ) {
		continue;
	}

	// Strip comment-only lines (//, *, #) so doc examples + design references
	// in block comments do not trip the gate. Production identifiers in
	// executable code are still caught.
	$executable = preg_replace( '/^\\s*(?:\\/\\/|\\*|#).*$/m', '', $contents );

	foreach ( $host_system_tokens as $token ) {
		if ( false !== strpos( $executable, $token ) ) {
			$found[] = array(
				'file'   => str_replace( dirname( __DIR__ ) . '/', '', $file->getPathname() ),
				'kind'   => 'host-system token',
				'detail' => $token,
			);
		}
	}

	foreach ( $host_node_id_patterns as $pattern ) {
		if ( preg_match( $pattern, $executable ) ) {
			$found[] = array(
				'file'   => str_replace( dirname( __DIR__ ) . '/', '', $file->getPathname() ),
				'kind'   => 'host-owned node-id literal',
				'detail' => $pattern,
			);
		}
	}
}

if ( ! empty( $found ) ) {
	echo "Source-boundary violations in /src/:\n\n";
	foreach ( $found as $hit ) {
		echo "  {$hit['file']}\n    {$hit['kind']}: {$hit['detail']}\n";
	}
	echo "\nFix: move the host-specific call into a host adapter plugin (see docs/host-extension-api.md) or route through the documented filter API.\n";
	exit( 1 );
}

$token_count   = count( $host_system_tokens );
$pattern_count = count( $host_node_id_patterns );
echo "OK — no source-boundary violations in /src/. Checked {$token_count} host-system tokens + {$pattern_count} host-owned node-id regex patterns.\n";
exit( 0 );
