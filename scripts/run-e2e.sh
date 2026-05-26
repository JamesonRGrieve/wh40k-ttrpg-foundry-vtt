#!/usr/bin/env bash
# Wrapper that skips Playwright entirely if .foundry-release/main.js is
# absent, unless FOUNDRY_INTEGRATION=required forces a failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROBE="${SCRIPT_DIR}/.foundry-release/main.js"

if [[ ! -f "${PROBE}" ]]; then
    if [[ "${FOUNDRY_INTEGRATION:-}" == "required" ]]; then
        echo "FOUNDRY_INTEGRATION=required but ${PROBE} is missing — run ./pull-foundry.sh" >&2
        exit 1
    fi
    echo "[integration] Tier B skipped — ${PROBE} not found (run ./pull-foundry.sh to enable, or set FOUNDRY_INTEGRATION=required to fail-on-missing)"
    exit 0
fi

# Foundry V14 server requires Node 24+. Resolve the binary to use: pnpm's
# managed runtime (`pnpm runtime set node 24 -g`, lives at
# ~/.local/share/pnpm/bin/node) wins over the system node if it is newer.
# Export FOUNDRY_NODE so playwright.foundry.config.ts spawns the right one
# regardless of the caller's PATH.
PNPM_NODE="${HOME}/.local/share/pnpm/bin/node"
if [[ -x "${PNPM_NODE}" ]] && (( $("${PNPM_NODE}" -p 'process.versions.node.split(".")[0]') >= 24 )); then
    FOUNDRY_NODE="${PNPM_NODE}"
elif (( $(node -p 'process.versions.node.split(".")[0]') >= 24 )); then
    FOUNDRY_NODE="$(command -v node)"
else
    if [[ "${FOUNDRY_INTEGRATION:-}" == "required" ]]; then
        echo "FOUNDRY_INTEGRATION=required but no Node 24+ binary found — run \`pnpm runtime set node 24 -g\` or upgrade system node" >&2
        exit 1
    fi
    echo "[integration] Tier B skipped — Foundry V14 needs Node 24+, no qualifying binary found (run \`pnpm runtime set node 24 -g\` to provision)"
    exit 0
fi
export FOUNDRY_NODE

# Build the system into dist/ before the e2e world boots, so Tier B always
# tests the current working tree rather than a stale build. setup-foundry-test-
# world.sh only *symlinks* dist/ (and errors if it's missing) — it never builds.
# Skip with E2E_SKIP_BUILD=1 when iterating on spec files alone against an
# already-current dist/.
if [[ "${E2E_SKIP_BUILD:-}" != "1" ]]; then
    echo "[integration] Building system → dist/ before e2e (set E2E_SKIP_BUILD=1 to skip)…"
    (cd "${SCRIPT_DIR}" && pnpm build)
fi

exec playwright test -c "${SCRIPT_DIR}/playwright.foundry.config.ts" "$@"
