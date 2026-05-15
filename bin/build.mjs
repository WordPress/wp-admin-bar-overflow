#!/usr/bin/env node
/**
 * Bundles the runtime JS + CSS to `dist/runtime.{js,css}` and (optionally)
 * checks gzipped sizes against the Decision 8 byte budgets:
 *
 *   - Runtime JS  ≤ 8 KB gzipped
 *   - Runtime CSS ≤ 4 KB gzipped
 *
 * Usage:
 *   node bin/build.js               # build only
 *   node bin/build.js --check-size  # build + assert budgets (CI gate)
 *
 * The bundler is esbuild — chosen for its tiny dep tree, predictable output,
 * and IIFE/ESM bundling out of the box. Webpack would work too; the gate
 * cares about the byte budgets, not the tool.
 */

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_BUDGET_BYTES = 8 * 1024;
const CSS_BUDGET_BYTES = 4 * 1024;

await build({
	entryPoints: [resolve(ROOT, 'src/js/index.js')],
	bundle: true,
	format: 'iife',
	target: 'es2019',
	minify: true,
	outfile: resolve(ROOT, 'dist/runtime.js'),
	legalComments: 'none',
	logLevel: 'warning',
});

await build({
	entryPoints: [resolve(ROOT, 'src/css/index.css')],
	bundle: true,
	minify: true,
	outfile: resolve(ROOT, 'dist/runtime.css'),
	legalComments: 'none',
	logLevel: 'warning',
});

if (process.argv.includes('--check-size')) {
	const js = await readFile(resolve(ROOT, 'dist/runtime.js'));
	const css = await readFile(resolve(ROOT, 'dist/runtime.css'));
	const jsGz = gzipSync(js).length;
	const cssGz = gzipSync(css).length;

	const fmt = (n) => n.toString().padStart(6);
	console.log(`JS  raw: ${fmt(js.length)} B`);
	console.log(`JS  gz:  ${fmt(jsGz)} B  (budget ${JS_BUDGET_BYTES} B)`);
	console.log(`CSS raw: ${fmt(css.length)} B`);
	console.log(`CSS gz:  ${fmt(cssGz)} B  (budget ${CSS_BUDGET_BYTES} B)`);

	let failed = false;
	if (jsGz > JS_BUDGET_BYTES) {
		console.error(`FAIL: JS bundle ${jsGz} B > ${JS_BUDGET_BYTES} B gzipped`);
		failed = true;
	}
	if (cssGz > CSS_BUDGET_BYTES) {
		console.error(`FAIL: CSS bundle ${cssGz} B > ${CSS_BUDGET_BYTES} B gzipped`);
		failed = true;
	}
	if (failed) {
		process.exit(1);
	}
	console.log('OK: bundles within Decision 8 byte budgets.');
}
