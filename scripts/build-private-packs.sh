#!/usr/bin/env bash
#
# build-private-packs.sh — Compile the private, copyrighted content packs
# (src/packs-private) and merge them beside the public packs in dist/packs,
# folding their declarations into dist/system.json.
#
# Run AFTER a normal system build (dist/ must exist). Shared by the campaign
# deploy (../deploy.sh) and the Tier B e2e runner (scripts/run-e2e.sh), so the
# e2e world exercises exactly the compendium content production ships. The
# public release (build-system.sh release) never calls this, so copyrighted
# content never reaches a published build.
#
# Exit status: 0 when the packs were merged, or when src/packs-private is not
# checked out / produced no packs (a notice is printed — public packs only);
# non-zero when compiling or merging failed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRIVATE_SRC="${ROOT}/src/packs-private"
DIST="${ROOT}/dist"

if [[ ! -d "${PRIVATE_SRC}" ]]; then
    echo "[private-packs] src/packs-private not checked out — public packs only"
    exit 0
fi
if [[ ! -f "${DIST}/system.json" ]]; then
    echo "[private-packs] ${DIST}/system.json missing — build the system first" >&2
    exit 1
fi

echo "[private-packs] compiling ${PRIVATE_SRC}"
WH40K_PACKS_SRC="${PRIVATE_SRC}" bash "${ROOT}/src/packs/build-compendium.sh" build

if [[ ! -d "${PRIVATE_SRC}/.build/packs" ]]; then
    echo "[private-packs] private content produced no packs (${PRIVATE_SRC}/.build/packs absent) — public packs only"
    exit 0
fi

echo "[private-packs] merging into dist/packs"
mkdir -p "${DIST}/packs"
cp -R "${PRIVATE_SRC}/.build/packs/." "${DIST}/packs/"
# The public src/system.json declares only public packs; the private packs'
# declarations + folder tree live in the private repo and are merged into the
# built manifest here.
node "${ROOT}/scripts/merge-private-manifest.mjs" "${DIST}/system.json" "${PRIVATE_SRC}/system.packs.json"
