#!/usr/bin/env bash
# Cut a release tag for the plugin.
#
# Updates the plugin header's `Version:` line, the
# `WP_ADMIN_BAR_OVERFLOW_VERSION` constant, and package metadata. Commits the
# bump on the current branch, tags `vX.Y.Z`, then prints follow-up instructions
# for pushing and publishing the release. Does not push or build the zip itself;
# see bin/package.sh for the zip build and the GitHub release UI for publishing.
#
# Usage: bin/release.sh X.Y.Z

set -euo pipefail

if [ "$#" -ne 1 ]; then
	echo "Usage: $(basename "$0") X.Y.Z" >&2
	exit 1
fi

NEW_VERSION="$1"

if ! [[ "${NEW_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]]; then
	echo "release.sh: '${NEW_VERSION}' is not a semver. Expected X.Y.Z or X.Y.Z-tag." >&2
	exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_FILE="${ROOT_DIR}/wp-admin-bar-overflow.php"

if [ ! -f "${PLUGIN_FILE}" ]; then
	echo "release.sh: plugin bootstrap not found at ${PLUGIN_FILE}" >&2
	exit 1
fi

if ! git -C "${ROOT_DIR}" diff --quiet || ! git -C "${ROOT_DIR}" diff --cached --quiet; then
	echo "release.sh: working tree is dirty. Commit or stash first." >&2
	exit 1
fi

# Update the Version: header.
sed -i.bak -E "s|^([[:space:]]*\\*[[:space:]]*Version:[[:space:]]*).+$|\\1${NEW_VERSION}|" "${PLUGIN_FILE}"
# Update the WP_ADMIN_BAR_OVERFLOW_VERSION constant.
sed -i.bak -E "s|(define\\([[:space:]]*'WP_ADMIN_BAR_OVERFLOW_VERSION'[[:space:]]*,[[:space:]]*')[^']+(')|\\1${NEW_VERSION}\\2|" "${PLUGIN_FILE}"
rm -f "${PLUGIN_FILE}.bak"

if [ -f "${ROOT_DIR}/package.json" ]; then
	( cd "${ROOT_DIR}" && npm version --no-git-tag-version --allow-same-version "${NEW_VERSION}" >/dev/null )
fi

# Sanity-check the rewrite.
PARSED="$(grep -E '^[[:space:]]*\*[[:space:]]*Version:' "${PLUGIN_FILE}" | head -1 | sed -E 's/.*Version:[[:space:]]*//')"
if [ "${PARSED}" != "${NEW_VERSION}" ]; then
	echo "release.sh: header rewrite failed; parsed '${PARSED}', expected '${NEW_VERSION}'." >&2
	exit 1
fi

git -C "${ROOT_DIR}" add "${PLUGIN_FILE}"
if [ -f "${ROOT_DIR}/package.json" ]; then
	git -C "${ROOT_DIR}" add "${ROOT_DIR}/package.json"
fi
if [ -f "${ROOT_DIR}/package-lock.json" ]; then
	git -C "${ROOT_DIR}" add "${ROOT_DIR}/package-lock.json"
fi
git -C "${ROOT_DIR}" commit -m "Release v${NEW_VERSION}"
git -C "${ROOT_DIR}" tag "v${NEW_VERSION}"

cat <<EOF

Tagged v${NEW_VERSION}. Next:

  git push origin HEAD --tags
  bin/package.sh

Then upload dist/wp-admin-bar-overflow.zip as a GitHub release asset so the
Playground blueprint and WPCOM sync can find it at
/releases/latest/download/wp-admin-bar-overflow.zip.
EOF
