#!/usr/bin/env bash
#
# pull-foundry.sh — Mirror the Foundry server's compiled client (JS, CSS, HTML,
# fonts) and installed systems / modules into .foundry-release/, so Storybook
# and tooling can reflect the actual deployed runtime. The wh40k-rpg system is
# excluded because that's the working tree.
#
# Usage:
#   FOUNDRY_PASS=... ./pull-foundry.sh
#
# Required env:
#   FOUNDRY_PASS         — SSH password for FOUNDRY_USER@FOUNDRY_HOST
#
# Optional env (with defaults):
#   FOUNDRY_HOST         (192.168.5.40)
#   FOUNDRY_USER         (root)
#   FOUNDRY_APP_PATH     (/opt/foundry-vtt/current)
#   FOUNDRY_DATA_PATH    (/opt/foundry-vtt/data/Data)
#   FOUNDRY_RELEASE_DIR  (.foundry-release, relative to this script)
#   EXCLUDE_SYSTEM       (wh40k-rpg)
#
# The pulled tree:
#   .foundry-release/
#     public/      Foundry's public/ — css, fonts, icons, lang, scripts, ui, ...
#     dist/        Foundry's dist/  — server-side compiled JS bundles
#     templates/   Foundry's HTML templates (app-window.html, etc.)
#     systems/     Other installed systems (excluding $EXCLUDE_SYSTEM)
#     modules/     Installed modules (plugins)

set -euo pipefail

: "${FOUNDRY_HOST:=192.168.5.40}"
: "${FOUNDRY_USER:=root}"
: "${FOUNDRY_PASS:?Set FOUNDRY_PASS env var (see ../VTT_WIKI.md)}"
: "${FOUNDRY_APP_PATH:=/opt/foundry-vtt/current}"
: "${FOUNDRY_DATA_PATH:=/opt/foundry-vtt/data/Data}"
: "${FOUNDRY_RELEASE_DIR:=.foundry-release}"
: "${EXCLUDE_SYSTEM:=wh40k-rpg}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELEASE_DIR="${SCRIPT_DIR}/${FOUNDRY_RELEASE_DIR}"

require() {
    command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found in PATH" >&2; exit 1; }
}
require sshpass
require rsync
require ssh

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PubkeyAuthentication=no"

mkdir -p "${RELEASE_DIR}"

# One-time migration: clear legacy flat-layout files from earlier ad-hoc copies
# of public/scripts. Anything in the new structured subdirs is preserved.
find "${RELEASE_DIR}" -maxdepth 1 -mindepth 1 \
    ! -name 'public' ! -name 'dist' ! -name 'templates' \
    ! -name 'systems' ! -name 'modules' \
    -exec rm -rf {} +

pull() {
    local label="$1"
    local src="$2"
    local dst="$3"
    shift 3
    echo "=== Pulling ${label} ==="
    echo "    ${FOUNDRY_USER}@${FOUNDRY_HOST}:${src}  →  ${dst}"
    mkdir -p "${dst}"
    sshpass -p "${FOUNDRY_PASS}" rsync -a --delete-after --info=stats2,progress2 \
        -e "ssh ${SSH_OPTS}" \
        "$@" \
        "${FOUNDRY_USER}@${FOUNDRY_HOST}:${src}" \
        "${dst}"
}

pull "Foundry public assets (css/fonts/icons/lang/scripts/ui)" \
    "${FOUNDRY_APP_PATH}/public/" \
    "${RELEASE_DIR}/public/"

pull "Foundry dist (server-side compiled JS)" \
    "${FOUNDRY_APP_PATH}/dist/" \
    "${RELEASE_DIR}/dist/"

pull "Foundry HTML templates" \
    "${FOUNDRY_APP_PATH}/templates/" \
    "${RELEASE_DIR}/templates/"

pull "installed systems (excluding ${EXCLUDE_SYSTEM})" \
    "${FOUNDRY_DATA_PATH}/systems/" \
    "${RELEASE_DIR}/systems/" \
    --exclude="/${EXCLUDE_SYSTEM}/" \
    --exclude="/${EXCLUDE_SYSTEM}"

pull "installed modules (plugins)" \
    "${FOUNDRY_DATA_PATH}/modules/" \
    "${RELEASE_DIR}/modules/"

echo ""
echo "=== Done ==="
du -sh "${RELEASE_DIR}"/* 2>/dev/null | sort -h
