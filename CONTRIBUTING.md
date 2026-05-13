# Contributing to WP Admin Bar Overflow

Thanks for considering a contribution. This project follows the WordPress project's general code-contribution norms and the [WordPress Code of Conduct](https://make.wordpress.org/handbook/community-code-of-conduct/).

## Reporting bugs

Open a [GitHub Issue](https://github.com/Automattic/wp-admin-bar-overflow/issues) with:

- WordPress version, PHP version, browser
- List of active plugins (or a representative subset that reproduces the issue)
- Reproduction steps
- Expected behavior vs. observed behavior
- Console errors / screenshots if relevant
- Viewport width (especially relevant for overflow / responsive bugs)

For **security issues**, see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Design feedback / open questions

For UX questions, "should we…?" discussions, demo recordings, or feature ideas without a concrete acceptance criterion, use GitHub Discussions once the repo moves to its final location. In the meantime, open an Issue with the `discussion` label.

## Code contributions

### Setup

```bash
git clone https://github.com/Automattic/wp-admin-bar-overflow.git
cd wp-admin-bar-overflow
composer install    # devDependencies (phpunit, phpcs)
npm install         # devDependencies (jest, eslint, stylelint)
```

Drop the repo into `wp-content/plugins/` of any WordPress site (a fresh [Playground](https://playground.wordpress.net/) instance works for quick checks; clone into a vanilla WP install for longer iteration).

### Before opening a PR

Run the local test suite:

```bash
php tests/test-grep-no-wpcom-tokens.php   # CI gate: no host-specific tokens in /src/
composer test                              # PHPUnit
composer lint                              # PHPCS
npm test                                   # Jest tests
npm run lint                               # ESLint + Stylelint
```

The grep test exits 0 on success. The same gate runs in CI.

### Architecture and conventions

Read [`docs/architecture.md`](docs/architecture.md) for the layout (added in a follow-up PR), then [`docs/host-extension-api.md`](docs/host-extension-api.md) if your change touches anything filter-API-shaped.

Coding conventions:

- **PHP**: WordPress Coding Standards. PHP 8.0+ syntax features welcome (null-safe, named args, match expressions, typed properties). No PSR-4; we follow the WordPress plugin idiom of plain `require_once` + procedural class names (`Admin_Bar_Overflow_Classifier`, `Admin_Bar_Overflow_Data_Planner`, etc.).
- **JS**: plain ES modules (`type="module"` in the page, dynamic import for siblings). No build step, no React, no `@wordpress/*` runtime dependencies. We rely on browser-supported ES2020+ syntax.
- **CSS**: vanilla CSS, scoped under `body.wp-admin-bar-overflow-active`. No preprocessors.
- **Comments**: explain WHY, not WHAT. The codebase tries to keep load-bearing decisions documented inline rather than buried in commit messages.

### Pull requests

1. Fork the repo, create a feature branch off `trunk`.
2. Make your change. Keep PRs small and focused (one concern per PR).
3. Run the test suite locally; make sure CI is green.
4. Open the PR against `trunk`. Reference any related Discussion or Issue.

The first 5 PRs from a new contributor are reviewed by a maintainer regardless of CI status (sanity check the contribution flow). After 5 merged PRs, contributors can be invited to the `triage` team (issue-label management, no merge rights).

By submitting a contribution you license it under GPL-2.0-or-later. We don't require a CLA.

## Host-adapter authoring

If you maintain a managed-WordPress host or a multi-site network and want to customise classification, priority, or trigger placement (for example, prepending host-specific right-side IDs to the trigger's insertion target), you don't need to fork or modify this plugin. Read [`docs/host-extension-api.md`](docs/host-extension-api.md) (added in a follow-up PR) — it documents the filter API and shows worked examples.

## Maintainers

See [`MAINTAINERS.md`](MAINTAINERS.md) for the current set + how to reach them.
