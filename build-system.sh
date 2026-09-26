#!/usr/bin/env bash
#
# build-system.sh — Install toolchain and build the wh40k-rpg Foundry VTT
# system, then compile the public generic compendiums from src/packs. (The
# private copyrighted content in src/packs-private is compiled and shipped ONLY
# by the campaign deploy — see deploy.sh — never by this public system build.)
#
# Usage:
#   ./build-system.sh           # install toolchain (if needed), deps, build
#   ./build-system.sh deps      # install toolchain + deps only (no build)
#   ./build-system.sh build     # build only (assumes deps already installed)
#   ./build-system.sh release   # build, then stage archive/release/
#
set -euo pipefail

BUILD_SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${BUILD_SYSTEM_DIR}"
PNPM_VERSION="$(node -p "require('${REPO_ROOT}/package.json').packageManager.split('@')[1]" 2>/dev/null || echo "")"
COMPENDIUM_STAGE_ROOT="${REPO_ROOT}/src/packs/.build"
COMPENDIUM_STAGE_PACKS_DIR="${COMPENDIUM_STAGE_ROOT}/packs"

require_node() {
    if ! command -v node >/dev/null 2>&1; then
        echo "ERROR: node is not installed. Install Node.js >= 20 before running build-system.sh." >&2
        exit 1
    fi
}

ensure_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        return 0
    fi

    if command -v corepack >/dev/null 2>&1; then
        echo "=== Enabling pnpm via corepack ==="
        corepack enable
        if [ -n "$PNPM_VERSION" ]; then
            corepack prepare "pnpm@${PNPM_VERSION}" --activate
        fi
        return 0
    fi

    echo "=== corepack unavailable; installing pnpm via npm ==="
    if [ -n "$PNPM_VERSION" ]; then
        npm install -g "pnpm@${PNPM_VERSION}"
    else
        npm install -g pnpm
    fi
}

install_deps() {
    echo "=== Installing dependencies (pnpm install --frozen-lockfile) ==="
    pnpm install --frozen-lockfile
}

build_system_dist() {
    echo "=== Building wh40k-rpg system ==="
    pnpm build:system
}

build_compendiums() {
    local script="${REPO_ROOT}/src/packs/build-compendium.sh"
    if [ ! -f "$script" ]; then
        echo "=== src/packs/build-compendium.sh is unavailable; skipping compendium build ==="
        return 0
    fi

    bash "$script" build

    if [ ! -d "${COMPENDIUM_STAGE_PACKS_DIR}" ]; then
        echo "=== No staged compendiums were produced; leaving dist/packs absent ==="
        return 0
    fi

    echo "=== Moving staged compendiums into dist/packs ==="
    rm -rf "${REPO_ROOT}/dist/packs"
    mkdir -p "${REPO_ROOT}/dist"
    mv "${COMPENDIUM_STAGE_PACKS_DIR}" "${REPO_ROOT}/dist/packs"
}

build_archive() {
    echo "=== Creating wh40k-rpg archive ==="
    pnpm build:archive
}

filter_release_manifest() {
    # Declare only the packs actually compiled into dist/packs. src/system.json
    # declares only public packs (the campaign's private declarations are merged
    # by the deploy, never here), so this is a safety net: a declared public pack
    # that failed to build is dropped rather than making Foundry error on a
    # missing pack dir. Only the manual `release` mode runs this.
    echo "=== Declaring only the packs built into dist/packs (public generics) ==="
    node scripts/filter-manifest-packs.mjs dist/system.json
}

stage_release() {
    echo "=== Staging Foundry install manifest pair ==="
    local version
    version="$(node -p "require('./src/system.json').version")"
    local versioned_zip="archive/wh40k-rpg-${version}.zip"
    local out_dir="archive/release"

    if [ ! -f "$versioned_zip" ]; then
        echo "ERROR: ${versioned_zip} not found — build must run first." >&2
        exit 1
    fi
    if [ ! -f "dist/system.json" ]; then
        echo "ERROR: dist/system.json not found — build must run first." >&2
        exit 1
    fi
    mkdir -p "$out_dir"
    cp -f "dist/system.json" "${out_dir}/system.json"
    cp -f "$versioned_zip" "${out_dir}/wh40k-rpg.zip"

    # No packs are stripped: a public build only ever compiles the clean generic
    # packs in src/packs (the copyrighted content in the src/packs-private
    # submodule is never built into dist/packs). filter_release_manifest already
    # narrowed system.json packs[] to exactly the packs shipped in dist/packs.
    echo "  Manifest : ${out_dir}/system.json  (v${version})"
    echo "  Package  : ${out_dir}/wh40k-rpg.zip"
    echo "  Upload both to a GitHub release; Foundry installs from the manifest URL in system.json."
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
            build_system_dist
            build_compendiums
            build_archive
            ;;
        release)
            install_deps
            build_system_dist
            build_compendiums
            filter_release_manifest
            build_archive
            stage_release
            ;;
        all)
            install_deps
            build_system_dist
            build_compendiums
            build_archive
            ;;
        *)
            echo "Usage: $0 {all|deps|build|release}" >&2
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
