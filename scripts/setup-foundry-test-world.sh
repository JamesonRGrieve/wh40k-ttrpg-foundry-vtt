#!/usr/bin/env bash
#
# setup-foundry-test-world.sh — Provision an ephemeral Foundry data directory
# under .foundry-release/data-test/ with the wh40k-rpg working tree symlinked
# in and the e2e seed world copied into place.
#
# Idempotent: safe to re-run. Intended to be invoked by Playwright's
# global-setup or directly during local debugging.
#
# Env:
#   FOUNDRY_RELEASE_DIR (default: .foundry-release)
#   SYSTEM_ID           (default: wh40k-rpg)
#   SEED_WORLD_NAME     (default: wh40k-e2e)
#   FOUNDRY_TEST_PORT   (default: 30001)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${FOUNDRY_RELEASE_DIR:=${SCRIPT_DIR}/.foundry-release}"
: "${SYSTEM_ID:=wh40k-rpg}"
: "${SEED_WORLD_NAME:=wh40k-e2e}"
# Port may be passed as $1 (per-worker isolated world) or via env; defaults to 30001.
FOUNDRY_TEST_PORT="${1:-${FOUNDRY_TEST_PORT:-30001}}"

# Must live OUTSIDE .foundry-release/ — Foundry refuses dataPath located
# inside the application root. One data dir per port so each worker gets a
# fully isolated world (no shared websocket broadcasts between workers).
DATA_DIR="${SCRIPT_DIR}/.foundry-test-data-${FOUNDRY_TEST_PORT}"
DATA_DATA="${DATA_DIR}/Data"
CONFIG_DIR="${DATA_DIR}/Config"
SYSTEMS_DIR="${DATA_DATA}/systems"
WORLDS_DIR="${DATA_DATA}/worlds"

if [[ ! -f "${FOUNDRY_RELEASE_DIR}/main.js" ]]; then
    echo "[setup-foundry-test-world] ${FOUNDRY_RELEASE_DIR}/main.js missing — run ./pull-foundry.sh first" >&2
    exit 2
fi

if [[ ! -d "${SCRIPT_DIR}/dist" ]]; then
    echo "[setup-foundry-test-world] dist/ missing — run 'pnpm build' first" >&2
    exit 3
fi

mkdir -p "${SYSTEMS_DIR}" "${WORLDS_DIR}" "${CONFIG_DIR}"

# Install the working-tree dist/ as the system. The static, lock-free assets
# (module / icons / images / templates / css / lang / system.json) are
# symlinked so each world tracks the live build, but the LevelDB compendium
# packs are COPIED per world: LevelDB takes a single-process directory LOCK on
# open, so multiple isolated Foundry instances symlinking one dist/packs would
# fail with "Database failed to open". Packs are small (~34M); copy is fast.
SYSTEM_DIR="${SYSTEMS_DIR}/${SYSTEM_ID}"
# Drop any legacy whole-dir symlink from the pre-isolation setup.
if [[ -L "${SYSTEM_DIR}" ]]; then
    rm -f "${SYSTEM_DIR}"
fi
mkdir -p "${SYSTEM_DIR}"
for entry in "${SCRIPT_DIR}/dist"/*; do
    base="$(basename "${entry}")"
    target="${SYSTEM_DIR}/${base}"
    if [[ "${base}" == "packs" ]]; then
        # Per-world copy so this instance owns its pack LevelDBs. Re-copy each
        # run so a rebuilt dist's packs are reflected.
        rm -rf "${target}"
        cp -r "${entry}" "${target}"
    else
        # Static asset — symlink, re-pointing if stale.
        if [[ -L "${target}" ]] && [[ "$(readlink "${target}")" != "${entry}" ]]; then
            rm -f "${target}"
        fi
        if [[ ! -e "${target}" ]]; then
            ln -s "${entry}" "${target}"
        fi
    fi
done

# Copy seed world (idempotent rsync).
SEED_SRC="${SCRIPT_DIR}/tests/e2e/fixtures/seed-world"
SEED_DST="${WORLDS_DIR}/${SEED_WORLD_NAME}"
if [[ ! -d "${SEED_SRC}" ]]; then
    echo "[setup-foundry-test-world] seed world ${SEED_SRC} missing" >&2
    exit 4
fi
mkdir -p "${SEED_DST}"
cp -r "${SEED_SRC}/." "${SEED_DST}/"

# Foundry options.json. adminPassword null disables admin auth for the test
# instance only; never enable on a production data dir.
cat > "${CONFIG_DIR}/options.json" <<JSON
{
    "port": ${FOUNDRY_TEST_PORT},
    "hostname": "127.0.0.1",
    "world": "${SEED_WORLD_NAME}",
    "adminPassword": null,
    "proxyPort": null,
    "compressStatic": false,
    "noUpdate": true,
    "telemetry": false
}
JSON

# License file — copied from pull-foundry.sh output if present.
if [[ -f "${FOUNDRY_RELEASE_DIR}/license.json" ]]; then
    cp "${FOUNDRY_RELEASE_DIR}/license.json" "${CONFIG_DIR}/license.json"
else
    echo "[setup-foundry-test-world] WARNING: ${FOUNDRY_RELEASE_DIR}/license.json missing — Foundry may refuse to launch. Update pull-foundry.sh to mirror Config/license.json." >&2
fi

# NOTE: do NOT pre-seed users.db here. Foundry's World#setup() auto-creates a
# Gamemaster user the first time the world launches if none exists; if we
# write our own LevelDB at worlds/<id>/data/users.db, Foundry mistakes it
# for a legacy NEDB file and crashes on its NEDB→LevelDB migration path.
# Leave the dir empty; let Foundry populate it.

echo "[setup-foundry-test-world] ready: ${DATA_DIR} (port ${FOUNDRY_TEST_PORT}, world ${SEED_WORLD_NAME})"
