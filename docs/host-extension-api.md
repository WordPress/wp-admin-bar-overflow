# Host extension API

This document describes how a host (a managed-WordPress provider, a
multi-site administrator, or any plugin author) overrides this plugin's
default behaviour.

The plugin exposes a small, stable filter API. The default behaviour is
correct on a vanilla WordPress install; a host adapter only needs to bind a
filter when a host-specific concern applies.

## Filter reference

### `wp_admin_bar_overflow_enabled`

```php
apply_filters( 'wp_admin_bar_overflow_enabled', bool $enabled, int $user_id ): bool
```

Gating predicate. Returns `true` to run the plugin for the current user,
`false` to skip everything. Default: `true` for any logged-in user.

A managed host can scope activation to a feature sticker or an opt-in
flag:

```php
add_filter(
	'wp_admin_bar_overflow_enabled',
	static function ( bool $enabled, int $user_id ): bool {
		if ( ! function_exists( 'has_blog_sticker' ) ) {
			return $enabled;
		}
		if ( ! has_blog_sticker( 'wp-admin-bar-overflow-redesign', get_current_blog_id() ) ) {
			return false;
		}
		return $enabled;
	},
	10,
	2
);
```

### `wp_admin_bar_overflow_node_classify`

```php
apply_filters( 'wp_admin_bar_overflow_node_classify', ?string $class, string $node_id, object $node ): ?string
```

Called once per node that is not in the curated registry. Return `'core'`,
`'wpcom'`, `'plugin'`, `'skip'`, or `null` to fall through. The default
classification (after the filter returns `null`) is `'plugin'`.

Use `'skip'` to suppress a node from the overflow dropdown entirely (the
original stays in place):

```php
add_filter(
	'wp_admin_bar_overflow_node_classify',
	static function ( ?string $class, string $node_id ): ?string {
		if ( 'my-plugin-special-node' === $node_id ) {
			return 'skip';
		}
		return $class;
	},
	10,
	2
);
```

Use `'wpcom'` (or any non-`'plugin'` class) to mark a node as host-owned so
the plugin leaves it alone. This is how a managed host keeps its own
right-side admin-bar items out of the Plugins dropdown.

### `wp_admin_bar_overflow_node_priority`

```php
apply_filters( 'wp_admin_bar_overflow_node_priority', int $priority, string $node_id, object $node ): int
```

Returns the sort key used for the plugin's nav model and dropdown ordering.
Default `100`; lower priorities render earlier in the dropdown.

### `wp_admin_bar_overflow_registry`

```php
apply_filters( 'wp_admin_bar_overflow_registry', array $registry ): array
```

Amend the registry in one pass. Useful when a host wants to ship a curated
default classification for a set of plugins rather than binding
`wp_admin_bar_overflow_node_classify` once per node:

```php
add_filter(
	'wp_admin_bar_overflow_registry',
	static function ( array $registry ): array {
		$registry['my-plugin-node'] = array(
			'nodeId'   => 'wp-admin-bar-my-plugin-node',
			'class'    => 'plugin',
			'parent'   => '',
			'priority' => 150,
			'labels'   => array(
				'canonical'     => 'My Plugin',
				'screen_reader' => null,
			),
		);
		return $registry;
	}
);
```

### `wp_admin_bar_overflow_dropdown_label`

```php
apply_filters( 'wp_admin_bar_overflow_dropdown_label', string $label ): string
```

The text shown on the dropdown trigger. Default `'Plugins'`.

### `wp_admin_bar_overflow_trigger_insert_before_ids`

```php
apply_filters( 'wp_admin_bar_overflow_trigger_insert_before_ids', array $ids ): array
```

A list of `top-secondary` ids the renderer searches when placing the
trigger. The trigger lands immediately before the first id in the list
that is present in the admin bar. Default `[ 'my-account' ]` (the stable
Core anchor inside `top-secondary`).

A host with its own right-side nodes should prepend them so the trigger
lands in the visually-correct slot. The public plugin's source never names
host-specific ids; that mapping lives in your adapter:

```php
add_filter(
	'wp_admin_bar_overflow_trigger_insert_before_ids',
	static function ( array $ids ): array {
		return array_merge( array( 'host-notifications', 'host-help' ), $ids );
	}
);
```

Bind this when the default Core anchor is not the right visual placement for
your host. For example, WordPress.com keeps the trigger at the leading edge
of its right-side account / Reader / notifications group.

### `wp_admin_bar_overflow_storage`

```php
apply_filters( 'wp_admin_bar_overflow_storage', $storage ): Admin_Bar_Overflow_Layout_Storage
```

Future hook for a customize / reorder feature. Bind a class that implements
`Admin_Bar_Overflow_Layout_Storage` to store per-user layout deltas somewhere
other than WordPress user meta. The current overflow dropdown does not
persist user layout state.

## Constants

The bootstrap honours two development-only constants:

```php
define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_DISABLED', true ); // kill switch
define( 'WP_ADMIN_BAR_OVERFLOW_FORCE_ENABLED',  true ); // bypass the gate
```

Both short-circuit `wp_admin_bar_overflow_enabled` regardless of any
host-adapter binding. Useful for sandbox testing.

## Adapter authoring checklist

When writing a host adapter:

1. Load only when the host is detected. Guard your adapter with
   `if ( defined( 'IS_YOUR_HOST' ) && IS_YOUR_HOST )` (or equivalent) so
   the public plugin keeps working unchanged on other hosts.

2. Bind `wp_admin_bar_overflow_enabled` with your host's gating predicate.
   Default to letting the filter chain decide unless the host explicitly
   wants the plugin off.

3. Bind `wp_admin_bar_overflow_node_classify` to mark host-owned ids
   (return `'wpcom'` or any non-`'plugin'` string). Skip ids the host
   doesn't own; do not return `'plugin'` for plugin nodes (the default
   classification already handles those).

4. Bind `wp_admin_bar_overflow_trigger_insert_before_ids` to prepend the
   host's right-side anchor ids if the host's UI expects the Plugins
   dropdown to land before them.

5. Keep host-specific id strings inside the adapter. The public plugin's
   `/src/` is grep-gated against the host-owned id list; an adapter is the
   right place for them.

## Worked example: managed-host adapter

```php
<?php
/*
 * Plugin Name: Example Host Adapter for WP Admin Bar Overflow
 */

if ( ! defined( 'IS_EXAMPLE_HOST' ) || ! IS_EXAMPLE_HOST ) {
	return;
}

add_filter(
	'wp_admin_bar_overflow_enabled',
	static function ( bool $enabled, int $user_id ): bool {
		return $enabled && example_host_feature_enabled( $user_id );
	},
	10,
	2
);

add_filter(
	'wp_admin_bar_overflow_node_classify',
	static function ( ?string $class, string $node_id ): ?string {
		$host_owned = array( 'notifications', 'help-center', 'reader', 'cart' );
		if ( in_array( $node_id, $host_owned, true ) ) {
			return 'wpcom';
		}
		return $class;
	},
	10,
	2
);

add_filter(
	'wp_admin_bar_overflow_trigger_insert_before_ids',
	static function ( array $ids ): array {
		return array_merge( array( 'notifications', 'help-center', 'reader', 'cart' ), $ids );
	}
);
```
