#!/usr/bin/env bash
# Build distributable plugin zips at dist/wp-admin-bar-overflow.zip and
# dist/wp-admin-bar-overflow-vX.Y.Z.zip.
#
# Reads the version number from the plugin header so the zip and the header
# can't drift. The zip is layout-stable: unpacking it produces a single
# `wp-admin-bar-overflow/` directory ready to drop into `wp-content/plugins/`.
#
# Usage: bin/package.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_SLUG="wp-admin-bar-overflow"
PLUGIN_FILE="${ROOT_DIR}/${PLUGIN_SLUG}.php"

if [ ! -f "${PLUGIN_FILE}" ]; then
	echo "package.sh: plugin bootstrap not found at ${PLUGIN_FILE}" >&2
	exit 1
fi

VERSION="$(grep -E '^[[:space:]]*\*[[:space:]]*Version:' "${PLUGIN_FILE}" | head -1 | sed -E 's/.*Version:[[:space:]]*//')"
if [ -z "${VERSION}" ]; then
	echo "package.sh: could not parse Version from ${PLUGIN_FILE}" >&2
	exit 1
fi

DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="${DIST_DIR}/${PLUGIN_SLUG}"
ZIP_PATH="${DIST_DIR}/${PLUGIN_SLUG}.zip"
VERSIONED_ZIP_PATH="${DIST_DIR}/${PLUGIN_SLUG}-v${VERSION}.zip"

rm -rf "${STAGE_DIR}" "${ZIP_PATH}" "${VERSIONED_ZIP_PATH}"
mkdir -p "${STAGE_DIR}"

# Build the runtime bundle first so the dist directory is fresh. The
# renderer's `emit_runtime_{css,js}` reads from dist/ at request time;
# shipping a zip without dist/ leaves the plugin functional as a PHP-only
# trigger registrar but with no runtime behaviour.
if ! command -v npm >/dev/null 2>&1; then
	echo "package.sh: npm is required to build runtime assets" >&2
	exit 1
fi
( cd "${ROOT_DIR}" && npm run build >/dev/null )
if [ ! -f "${ROOT_DIR}/dist/runtime.js" ] || [ ! -f "${ROOT_DIR}/dist/runtime.css" ]; then
	echo "package.sh: runtime assets were not built" >&2
	exit 1
fi

# Files and directories that ship in the distributable. Everything else
# (tests/, .github/, composer files, dev configs) stays out of the zip so the
# user-installed plugin is the runtime surface only.
cp "${ROOT_DIR}/${PLUGIN_SLUG}.php" "${STAGE_DIR}/"
cp "${ROOT_DIR}/LICENSE" "${STAGE_DIR}/"
cp "${ROOT_DIR}/README.md" "${STAGE_DIR}/"
cp -R "${ROOT_DIR}/src" "${STAGE_DIR}/src"
mkdir -p "${STAGE_DIR}/dist"
cp "${ROOT_DIR}/dist/runtime.js" "${STAGE_DIR}/dist/"
cp "${ROOT_DIR}/dist/runtime.css" "${STAGE_DIR}/dist/"

# Optionally include a readme.txt when present (wp.org-style readme).
if [ -f "${ROOT_DIR}/readme.txt" ]; then
	cp "${ROOT_DIR}/readme.txt" "${STAGE_DIR}/"
fi

(
	cd "${DIST_DIR}"
	zip -r "${ZIP_PATH}" "${PLUGIN_SLUG}" >/dev/null
)
cp "${ZIP_PATH}" "${VERSIONED_ZIP_PATH}"

rm -rf "${STAGE_DIR}"

echo "Packaged ${ZIP_PATH}"
echo "Packaged ${VERSIONED_ZIP_PATH}"
