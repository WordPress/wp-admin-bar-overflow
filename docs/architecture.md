# Architecture

The plugin runs as a regular WordPress plugin. It does not patch WordPress
core. It reads the registered admin-bar nodes after every `admin_bar_menu`
callback has fired, classifies them, registers its own right-side **Plugins**
dropdown, emits a JSON nav model inline as
`<script type="application/json" id="wp-admin-bar-overflow-data">`, and runs a
small JavaScript runtime that mirrors plugin nodes into the dropdown when
they no longer fit.

## Classifier and renderer

Two layers, each with one responsibility:

- **Classifier (`Admin_Bar_Overflow_Classifier`)** decides _what is a plugin
  node_. It evaluates each top-level admin-bar node (`parent` empty or
  `parent='top-secondary'`) and returns one of `'core'`, `'wpcom'`,
  `'plugin'`, or `'skip'`. Core ids come from a built-in allowlist
  (`src/registry.php`). Host-owned ids return `'wpcom'` from the host
  adapter's `wp_admin_bar_overflow_node_classify` binding. The classifier
  does not decide visibility or viewport behaviour.

- **Renderer (`Admin_Bar_Overflow_Renderer` + runtime JS)** decides _which
  classified plugin nodes to mirror at which viewport_. At wide desktop
  (≥ 1280px) nothing is mirrored. At narrow desktop (783-1279px), plugin
  nodes that no longer fit are hidden in place and shown as mirrors in the
  dropdown. At tablet + mobile (≤ 782px) all classified-as-plugin nodes are
  mirrored unconditionally.

Decoupling "what is plugin" from "what to mirror" lets the classifier stay
host-agnostic and the renderer carry the viewport-policy nuance.

## Admin-bar lifecycle

```
1. action 'admin_bar_menu' fires (Core + plugin nodes register here)
   - priority 10            most plugins
   - priority 100           Core registers top-secondary
   - priority 9999          Core registers #search
   - priority PHP_INT_MAX   rare late-registration outliers
2. action 'wp_before_admin_bar_render' fires
   - priority 10            Admin_Bar_Overflow_Classifier reads and classifies
   - priority 20            Admin_Bar_Overflow_Renderer registers dropdown shell
   - priority PHP_INT_MAX-1 Admin_Bar_Overflow_Data_Planner emits the inline JSON
3. WP_Admin_Bar::render() emits HTML
4. action 'wp_after_admin_bar_render' fires
   - runtime JS is printed after #wpadminbar exists in the document
```

The classifier reads on `wp_before_admin_bar_render` rather than any
`admin_bar_menu` priority so it sees the final node set including
`PHP_INT_MAX`-priority registrations.

## Contracts

The data shape the classifier emits is part of the public API.

### ClassificationEntry

```php
array{
    nodeId: string,                          // 'wp-admin-bar-<id>'
    rawId: string,                           // '<id>' without prefix
    class: 'core' | 'wpcom' | 'plugin' | 'skip',
    parent: ?string,                         // parent nodeId or null
    priority: int,                           // sort key; lower wins
    labels: array{
        canonical: ?string,
        screen_reader: ?string,
    },
    icon: array{ kind: string, ref: ?string },
    badge: array{ text: ?string, attention: bool },
    href: ?string,
    submenuChildren: list<string>,
}
```

All string values are passed through `wp_strip_all_tags` before they reach
the JSON payload. No raw HTML travels through the data planner.

### NavModel (emitted as `<script type="application/json" id="wp-admin-bar-overflow-data">`)

```typescript
type NavModel = {
    version: number;
    enabled: boolean;
    nodes: ClassificationEntry[];
    dropdown: {
        id: string;
        label: string;
        emptyMessage: string;
    };
    breakpoints: {
        narrowDesktop: number;
        tablet: number;
        mobile: number;
    };
    flags: {
        prefersReducedMotion: boolean;
    };
};
```

Encoding uses `wp_json_encode` with `JSON_HEX_TAG | JSON_HEX_AMP |
JSON_HEX_APOS | JSON_HEX_QUOT` so plugin-supplied label content cannot break
out of the inline `<script>` block. The runtime reads the payload via
`JSON.parse(document.getElementById('wp-admin-bar-overflow-data').textContent)`;
no `window` global is exported.

## Filter surface

| Filter | Default | Purpose |
| --- | --- | --- |
| `wp_admin_bar_overflow_enabled` | `true` for any logged-in user | gating predicate |
| `wp_admin_bar_overflow_node_classify` | `null` (fall through) | classify a node not in the registry |
| `wp_admin_bar_overflow_node_priority` | 100 | sort key inside the dropdown |
| `wp_admin_bar_overflow_registry` | curated map | amend the registry in one pass |
| `wp_admin_bar_overflow_dropdown_label` | `'Plugins'` | dropdown trigger label |
| `wp_admin_bar_overflow_trigger_insert_before_ids` | `[ 'my-account' ]` | placement target for the trigger |
| `wp_admin_bar_overflow_storage` | unbound | future customize / reorder storage adapter |

See [host-extension-api.md](host-extension-api.md) for the host-adapter
guide.

## Coexistence

The plugin makes no assumptions about being the only entity touching the admin
bar. It reads node state after every `admin_bar_menu` callback has fired and
never reparents or rewrites existing plugin nodes. The renderer registers a
new dropdown node and runs a reorder pass scoped to that node so the trigger
can sit before the configured right-side anchor.

## Storage

The current plugin does not persist user layout state. The
`Admin_Bar_Overflow_Layout_Storage` interface and the
`Admin_Bar_Overflow_User_Meta_Storage` default implementation are declared so
the `wp_admin_bar_overflow_storage` filter contract can remain stable when a
future customize / reorder feature is added.
