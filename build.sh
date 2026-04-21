#!/usr/bin/env bash
#
# build.sh — Install toolchain and build the wh40k-rpg Foundry VTT system.
#
# Runs from the module directory regardless of caller CWD. Idempotent:
# re-running is safe and fast when the toolchain and deps are already in place.
#
# Usage:
#   ./build.sh           # install toolchain (if needed), install deps, build
#   ./build.sh deps      # install toolchain + deps only (no build)
#   ./build.sh build     # build only (assumes deps already installed)
#   ./build.sh release   # build, then stage the Foundry install manifest pair
#                        # (system.json + wh40k-rpg.zip) under archive/release/
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Pin the pnpm version to whatever package.json declares so CI, local dev, and
# deploys all converge on the same toolchain.
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]" 2>/dev/null || echo "")"

require_node() {
    if ! command -v node >/dev/null 2>&1; then
        echo "ERROR: node is not installed. Install Node.js >= 20 before running build.sh." >&2
        exit 1
    fi
}

ensure_pnpm() {
    # Prefer corepack (ships with Node >= 16.10). Falls back to npm -g only if
    # corepack is missing, which shouldn't happen on a modern Node install.
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

build() {
    echo "=== Building wh40k-rpg system ==="
    pnpm build
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
    # Filenames here must match the manifest/download URLs declared in
    # src/system.json so Foundry's "Install System from Manifest URL" flow
    # resolves both files from the same GitHub release.
    cp -f "dist/system.json" "${out_dir}/system.json"
    cp -f "$versioned_zip" "${out_dir}/wh40k-rpg.zip"

    echo "  Manifest : ${out_dir}/system.json  (v${version})"
    echo "  Package  : ${out_dir}/wh40k-rpg.zip"
    echo "  Upload both to a GitHub release; Foundry installs from the manifest URL in system.json."
}

require_node
ensure_pnpm

case "${1:-all}" in
    deps)
        install_deps
        ;;
    build)
        build
        ;;
    release)
        install_deps
        build
        stage_release
        ;;
    all|"")
        install_deps
        build
        ;;
    *)
        echo "Usage: $0 {all|deps|build|release}" >&2
        exit 1
        ;;
esac
