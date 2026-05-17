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
: "${FOUNDRY_TEST_PORT:=30001}"

# Must live OUTSIDE .foundry-release/ — Foundry refuses dataPath located
# inside the application root.
DATA_DIR="${SCRIPT_DIR}/.foundry-test-data"
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

# Symlink the working tree dist/ as the system. Re-create if pointing
# somewhere stale.
SYSTEM_LINK="${SYSTEMS_DIR}/${SYSTEM_ID}"
if [[ -L "${SYSTEM_LINK}" ]] && [[ "$(readlink "${SYSTEM_LINK}")" != "${SCRIPT_DIR}/dist" ]]; then
    rm -f "${SYSTEM_LINK}"
fi
if [[ ! -e "${SYSTEM_LINK}" ]]; then
    ln -s "${SCRIPT_DIR}/dist" "${SYSTEM_LINK}"
fi

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
