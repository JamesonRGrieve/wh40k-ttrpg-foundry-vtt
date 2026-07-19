#!/usr/bin/env bash
#
# install-e2e-itempiles.sh — Download the Item Piles module + its dependencies
# (socketlib, lib-wrapper) into a gitignored cache so the Tier B real-module
# spec (tests/e2e/item-piles-module.spec.ts) can drive the actual
# game.itempiles.API. The cache is symlinked into each ephemeral test world by
# setup-foundry-test-world.sh; the spec enables the modules + reloads at runtime.
#
# Idempotent: skips a module whose module.json is already present. Explicit +
# optional — the real-module tier skip-gates when the cache is absent, so this
# is never required to run the rest of the suite. Never commits the binaries.
#
#   scripts/install-e2e-itempiles.sh          # populate the cache
#   FORCE=1 scripts/install-e2e-itempiles.sh  # re-download even if present

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_DIR="${SCRIPT_DIR}/.foundry-test-modules"
mkdir -p "${CACHE_DIR}"

# id → release zip URL. Item Piles is pinned to the V14-verified 3.3.4; its deps
# track "latest" (both are kept current for the live Foundry).
declare -A MODULE_ZIPS=(
    [item-piles]="https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/download/3.3.4/module.zip"
    [socketlib]="https://github.com/manuelVo/foundryvtt-socketlib/releases/latest/download/module.zip"
    [lib-wrapper]="https://github.com/ruipin/fvtt-lib-wrapper/releases/download/v1.13.5.1/lib-wrapper-v1.13.5.1.zip"
)

for id in "${!MODULE_ZIPS[@]}"; do
    dest="${CACHE_DIR}/${id}"
    if [[ -f "${dest}/module.json" && "${FORCE:-}" != "1" ]]; then
        echo "[install-e2e-itempiles] ${id}: already present (FORCE=1 to re-download)"
        continue
    fi
    url="${MODULE_ZIPS[${id}]}"
    tmp="$(mktemp -d)"
    echo "[install-e2e-itempiles] ${id}: downloading ${url}"
    if ! curl -fsSL --retry 3 -o "${tmp}/module.zip" "${url}"; then
        echo "[install-e2e-itempiles] ${id}: download FAILED — the real-module e2e tier will skip-gate" >&2
        rm -rf "${tmp}"
        continue
    fi
    rm -rf "${dest}"
    mkdir -p "${dest}"
    # Some release zips nest everything under a top-level dir; flatten so
    # module.json lands at "${dest}/module.json" regardless.
    unzip -q "${tmp}/module.zip" -d "${tmp}/x"
    if [[ -f "${tmp}/x/module.json" ]]; then
        cp -r "${tmp}/x/." "${dest}/"
    else
        inner="$(dirname "$(find "${tmp}/x" -maxdepth 2 -name module.json | head -1)")"
        cp -r "${inner}/." "${dest}/"
    fi
    rm -rf "${tmp}"
    if [[ -f "${dest}/module.json" ]]; then
        echo "[install-e2e-itempiles] ${id}: installed → ${dest}"
    else
        echo "[install-e2e-itempiles] ${id}: module.json missing after extract — skip-gate will apply" >&2
    fi
done

echo "[install-e2e-itempiles] cache ready at ${CACHE_DIR}"
