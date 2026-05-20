#!/usr/bin/env sh
set -eu

REPO="${AURA_LYRICS_REPO:-${DYNAMIC_PIP_LYRICS_REPO:-SayBGM/AuraLyrics}}"
EXTENSION_NAME="aura-lyrics.js"
BASE_URL="https://github.com/${REPO}/releases/latest/download"

if ! command -v spicetify >/dev/null 2>&1; then
	echo "spicetify CLI was not found in PATH." >&2
	exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
	echo "curl was not found in PATH." >&2
	exit 1
fi

EXTENSION_DIR="$(spicetify -e path root)"
mkdir -p "$EXTENSION_DIR"

echo "Installing ${EXTENSION_NAME} to ${EXTENSION_DIR}"
curl -fsSL "${BASE_URL}/${EXTENSION_NAME}" -o "${EXTENSION_DIR}/${EXTENSION_NAME}"

spicetify config extensions "${EXTENSION_NAME}"
spicetify apply

echo "AuraLyrics installed."
