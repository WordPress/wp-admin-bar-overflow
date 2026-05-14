// Playwright config for the A.1 entry-checkpoint prototype.
// - axe-trigger.spec.js runs against the static HTML fixtures (no server).
// - perf-*.spec.js runs against a host-supplied WP base URL when E2E_BASE_URL
//   is set; otherwise those specs are skipped.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './tests/e2e',
	timeout: 30000,
	reporter: [['list']],
	use: {
		browserName: 'chromium',
		headless: true,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
