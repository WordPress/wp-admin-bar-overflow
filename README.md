# WP Admin Bar Overflow

> Responsive overflow for plugin-added WordPress admin-bar nodes.

[![License: GPL-2.0+](https://img.shields.io/badge/license-GPL--2.0%2B-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

The WordPress admin bar (`#wpadminbar`) crowds quickly at narrow viewports. Install a handful of plugins and their admin-bar nodes start colliding with the right-side items, falling off-screen, or becoming inaccessible on mobile — exactly the cohort that needs quick access most.

**WP Admin Bar Overflow** is a small WordPress plugin that gives plugin-added admin-bar nodes a responsive overflow path. As the viewport narrows, plugin nodes that no longer fit overflow into a right-side **Plugins** dropdown. On tablet and mobile, all plugin nodes group under the dropdown unconditionally so they remain reachable on every screen size. The original DOM nodes stay in place at their registered positions — plugin JavaScript that binds to specific node IDs continues to work — and click events on the mirrored dropdown items are forwarded to the originals.

It is built incrementally on top of Core's existing `WP_Admin_Bar` nested-menu pattern: a small PHP classifier reads the registered nodes, a thin layer of plain ES-module JavaScript handles the overflow detection and mirroring, and a small set of filter hooks lets host adapters customise classification, priority, and trigger placement.

## Status

This is **v0.1.0-alpha — early prototype, public-from-day-1.**

> ⚠️ **Temporary repository location.** This plugin is currently developed in `Automattic/wp-admin-bar-overflow` as a holding repo while the WordPress GitHub org coordination completes. The repository will move to `WordPress/wp-admin-bar-overflow` (or its final slug) before the v0.1.0 release. External links, release-zip URLs, and any sync automation will be updated as part of that move.

No release zips are published from this temporary location. The plugin is installable by cloning the repository into `wp-content/plugins/` for local development and testing.

## How it works

- **Classifier.** A PHP classifier reads `$wp_admin_bar->get_nodes()` at `wp_before_admin_bar_render` (after every `admin_bar_menu` callback has fired, including those at `PHP_INT_MAX`), classifies each top-level node as `core`, `plugin`, or `skip`, and emits a JSON nav model as an inline `<script type="application/json">` block. Host adapters override classification through documented filter hooks.
- **Responsive overflow.** A small ES-module runtime measures the admin bar's available width with `ResizeObserver`, hides plugin-classified nodes that don't fit at the current viewport, and mirrors them into the right-side **Plugins** dropdown. At tablet + mobile widths, all plugin-classified nodes mirror unconditionally.
- **Mirror + click forwarding.** The dropdown shows cloned `<li>` elements with renamed IDs (`mirror-` prefix); the original DOM nodes stay at their registered positions, hidden by CSS at narrow viewports. A delegated click handler forwards clicks on a mirrored item to its original, so plugin JavaScript that binds to original node IDs (counter toggles, panel openers, badge updates) continues to work.
- **Core's nested-menu pattern.** The dropdown trigger is registered as a standard `WP_Admin_Bar` top-level node with a placeholder child, so Core renders the `menupop` + `aria-expanded` shell at server-render time. Desktop click is handled by a small runtime click handler (~250 bytes); desktop hover, Enter, and touch tap remain Core-driven via `hoverintent`, `toggleHoverIfEnter`, and `mobileHover`.
- **No core changes.** The plugin runs entirely as an admin-bar overlay. The original `$wp_admin_bar` state is unchanged; the runtime decorates the rendered DOM.
- **Performance.** Runtime JS ≤ 8 KB gzipped, runtime CSS ≤ 4 KB gzipped (CI gate). Plain ES modules, no build step, no React, no `@wordpress/*` runtime dependencies. The classifier short-circuits when the enablement filter returns false, so non-opted-in users see no overhead beyond a sub-millisecond filter check.

For the architectural details — `/src/` layout, file responsibilities, contracts — see [`docs/architecture.md`](docs/architecture.md) (added in a follow-up PR).

For host-adapter authors: [`docs/host-extension-api.md`](docs/host-extension-api.md) (added in a follow-up PR) documents the filter API with worked examples.

## Related work

The sibling [`WordPress/wp-admin-sidebar`](https://github.com/WordPress/wp-admin-sidebar) project applies the same shape — public-from-day-1, classifier-driven, host-adapter API — to the wp-admin left navigation. The two plugins operate on different surfaces (`#adminmenu` vs `#wpadminbar`) and can be installed on the same site without conflict.

## Contributing

Bug reports, design feedback, and host-adapter questions all welcome.

- **Engineering work**: GitHub Issues + PRs. Run `composer install`, `npm install`, `npm run lint`, `php tests/test-grep-no-wpcom-tokens.php` before opening a PR. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **UX / design feedback / "should we…?" questions**: GitHub Discussions (once the repo moves to its final location).
- **Security issues**: see [`SECURITY.md`](SECURITY.md). Don't open a public issue.
- **Host-adapter authoring**: read [`docs/host-extension-api.md`](docs/host-extension-api.md) (added in a follow-up PR), then ask in the **Host Adapters** Discussion category.

## License

[GPL-2.0-or-later](LICENSE). Copyright the contributors. By submitting a contribution you license it under GPL-2.0+.

## Maintainers

See [`MAINTAINERS.md`](MAINTAINERS.md). Initial maintainer set: [@chriskmnds](https://github.com/chriskmnds) and [@lucasmdo](https://github.com/lucasmdo).
