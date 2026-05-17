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
#     main.js      Foundry server Node entrypoint (needed by Tier B e2e tests)
#     license.json License file mirrored from FOUNDRY_DATA_PATH/../Config/
#                  (needed for Foundry to launch under headless e2e)

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

# data-test/ is generated locally by scripts/setup-foundry-test-world.sh and
# must survive between pulls. license.json is mirrored separately below. All
# other root-level Foundry files (main.js, main.mjs, node_modules/, etc.) are
# pulled by the server-bundle rsync at the bottom of this script.

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

# Foundry's Node server bundle — main.js loader plus the real main.mjs entry,
# node_modules/, and package.json. Needed by Tier B e2e tests to spawn a
# headless server. Pulled with --exclude so we don't re-fetch what we
# already mirrored above (public/, dist/, templates/).
echo "=== Pulling Foundry server bundle (root files + node_modules) ==="
sshpass -p "${FOUNDRY_PASS}" rsync -a --delete-after --info=stats2,progress2 \
    -e "ssh ${SSH_OPTS}" \
    --exclude="/public/" --exclude="/dist/" --exclude="/templates/" \
    --exclude="/peek*.mjs" --exclude="/scan.mjs" --exclude="/migrate.mjs" \
    "${FOUNDRY_USER}@${FOUNDRY_HOST}:${FOUNDRY_APP_PATH}/" \
    "${RELEASE_DIR}/" || echo "  WARN: server bundle pull failed — Tier B will not boot" >&2

# License file lives next to Data/, not inside it. Path resolves whether
# FOUNDRY_DATA_PATH points at .../data/Data or .../data.
echo "=== Pulling Foundry license.json ==="
LICENSE_SRC="$(dirname "${FOUNDRY_DATA_PATH}")/Config/license.json"
sshpass -p "${FOUNDRY_PASS}" rsync -a --info=stats1 \
    -e "ssh ${SSH_OPTS}" \
    "${FOUNDRY_USER}@${FOUNDRY_HOST}:${LICENSE_SRC}" \
    "${RELEASE_DIR}/license.json" || echo "  WARN: license.json not present at ${LICENSE_SRC} — Tier B will refuse to launch" >&2

echo ""
echo "=== Done ==="
du -sh "${RELEASE_DIR}"/* 2>/dev/null | sort -h
