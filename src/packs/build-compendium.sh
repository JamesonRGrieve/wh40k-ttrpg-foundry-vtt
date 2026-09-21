#!/usr/bin/env bash
#
# build-compendium.sh — Compile a pack source root into a staging tree under
# <pack-root>/.build. Defaults to this script's own dir (src/packs, the public
# generic content); set WH40K_PACKS_SRC (repo-relative or absolute) to compile a
# different root — e.g. WH40K_PACKS_SRC=src/packs-private for the private
# copyrighted content (the private deploy does this). Missing or uninitialized
# pack content is treated as a no-op so the system build can still succeed.
#
# Usage:
#   ./src/packs/build-compendium.sh        # install deps (if needed), build src/packs
#   ./src/packs/build-compendium.sh deps   # install toolchain + deps only
#   ./src/packs/build-compendium.sh build  # build only
#   WH40K_PACKS_SRC=src/packs-private ./src/packs/build-compendium.sh build   # build the submodule
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Pack source root: WH40K_PACKS_SRC override (repo-relative or absolute) wins,
# otherwise this script's own directory (src/packs).
if [ -n "${WH40K_PACKS_SRC:-}" ]; then
    case "${WH40K_PACKS_SRC}" in
        /*) PACKS_DIR="${WH40K_PACKS_SRC}" ;;
        *)  PACKS_DIR="$(cd "${REPO_ROOT}/${WH40K_PACKS_SRC}" && pwd)" ;;
    esac
else
    PACKS_DIR="${SCRIPT_DIR}"
fi

COMPENDIUM_BUILD_ROOT="${PACKS_DIR}/.build"
COMPENDIUM_BUILD_PACKS_DIR="${COMPENDIUM_BUILD_ROOT}/packs"

# shellcheck source=/dev/null
source "${REPO_ROOT}/build-system.sh"

has_compendium_sources() {
    find "${PACKS_DIR}" -mindepth 3 -maxdepth 3 -type d -name _source -print -quit | grep -q .
}

build_compendium_dist() {
    if ! has_compendium_sources; then
        echo "=== src/packs content is unavailable; skipping compendium build ==="
        return 0
    fi

    echo "=== Building wh40k-rpg compendiums from ${PACKS_DIR} into ${COMPENDIUM_BUILD_PACKS_DIR} ==="
    rm -rf "${COMPENDIUM_BUILD_ROOT}"
    mkdir -p "${COMPENDIUM_BUILD_ROOT}"
    WH40K_PACKS_SRC="${PACKS_DIR}" WH40K_PACKS_BUILD_DIR="${COMPENDIUM_BUILD_PACKS_DIR}" pnpm build:compendium

    # Stage the compendium images BESIDE the compiled packs. These are copyrighted
    # bestiary/item crops: they must never enter the public system build (they live
    # here in the private content submodule, not src/images), and they deploy under
    # packs/ so the release step strips them (build-system.sh stage_release: `zip -d
    # 'packs/*'`). Pack img refs point at systems/wh40k-rpg/packs/images/...
    if [ -d "${PACKS_DIR}/images" ]; then
        echo "=== Staging compendium images into ${COMPENDIUM_BUILD_PACKS_DIR}/images ==="
        mkdir -p "${COMPENDIUM_BUILD_PACKS_DIR}/images"
        cp -R "${PACKS_DIR}/images/." "${COMPENDIUM_BUILD_PACKS_DIR}/images/"
    fi
}

main() {
    cd "$REPO_ROOT"
    require_node
    ensure_pnpm

    local mode="${1:-all}"

    case "$mode" in
        deps)
            install_deps
            ;;
        build)
            build_compendium_dist
            ;;
        all)
            install_deps
            build_compendium_dist
            ;;
        *)
            echo "Usage: $0 {all|deps|build}" >&2
            exit 1
            ;;
    esac
}

main "$@"
