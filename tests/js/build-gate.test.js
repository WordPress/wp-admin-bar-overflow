/**
 * Build-gate unit test. Re-runs the bundle with esbuild's metafile and
 * confirms (a) no forbidden package shows up in the dependency graph at
 * the steady state, and (b) the gate WOULD fail when a forbidden segment
 * is present in the inputs.
 */

const { build } = require('esbuild');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const FORBIDDEN_PACKAGES = [
	'react',
	'react-dom',
	'preact',
	'@wordpress/components',
	'@wordpress/data',
	'@wordpress/element',
];

test('runtime bundle contains no forbidden packages', async () => {
	const result = await build({
		entryPoints: [resolve(ROOT, 'src/js/index.js')],
		bundle: true,
		write: false,
		metafile: true,
		logLevel: 'silent',
	});
	const inputs = Object.keys(result.metafile.inputs || {});
	const hits = [];
	for (const input of inputs) {
		for (const pkg of FORBIDDEN_PACKAGES) {
			if (input.includes(`node_modules/${pkg}/`)) {
				hits.push({ pkg, input });
			}
		}
	}
	expect(hits).toEqual([]);
});

test('gate detects a forbidden segment in the input list', () => {
	const inputs = [
		'src/js/index.js',
		'node_modules/preact/dist/preact.module.js',
		'src/js/mirror.js',
	];
	const hits = [];
	for (const input of inputs) {
		for (const pkg of FORBIDDEN_PACKAGES) {
			if (input.includes(`node_modules/${pkg}/`)) {
				hits.push({ pkg, input });
			}
		}
	}
	expect(hits.length).toBe(1);
	expect(hits[0].pkg).toBe('preact');
});
