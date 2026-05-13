# Security policy

## Reporting a vulnerability

Please report security issues privately, **not** as a public GitHub Issue.

**Preferred channel:** [GitHub Security Advisories](https://github.com/Automattic/wp-admin-bar-overflow/security/advisories/new) — opens a private discussion thread with the maintainers.

**Backup channel:** email `security@automattic.com` with the subject line `WP Admin Bar Overflow — security report`. The Automattic security team triages and forwards to this project's maintainers.

## What to include

- A description of the issue.
- Reproduction steps (or proof-of-concept code if you have one).
- The affected version of the plugin (run `php -r "require 'wp-admin-bar-overflow.php'; echo WP_ADMIN_BAR_OVERFLOW_VERSION;"` or check the plugin header).
- Your assessment of impact (privacy / integrity / availability).

## Response

- We aim to acknowledge within **48 hours** of receipt.
- We follow a **coordinated disclosure window of 90 days** from the acknowledgment. After 90 days, the report is published in the GitHub Security Advisory regardless of fix status, with a clear statement of mitigations and any user actions required.
- If the issue is also present in WordPress core or in a host-side adapter, we coordinate with those teams in private before public disclosure.

## Scope

In scope: this plugin's PHP source (`src/`, `wp-admin-bar-overflow.php`), JS source (`src/*.js`), tests, and documented filter API.

Out of scope: third-party host adapters that hook our filter API (those are the host's responsibility); WordPress core; downstream forks.

## Hall of fame

We acknowledge security researchers in advisory disclosures and (with permission) in the project's release notes.
