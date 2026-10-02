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
#
# The private content packs are merged in exactly as the campaign deploy does,
# so the e2e world holds the compendium content production ships — without it
# every lean (compendium-joined) seed actor fails its hydration join.
if [[ "${E2E_SKIP_BUILD:-}" != "1" ]]; then
    echo "[integration] Building system → dist/ before e2e (set E2E_SKIP_BUILD=1 to skip)…"
    (cd "${SCRIPT_DIR}" && pnpm build)
    bash "${SCRIPT_DIR}/scripts/build-private-packs.sh"
fi

CONFIG="${SCRIPT_DIR}/playwright.foundry.config.ts"

# Resolve the Playwright CLI explicitly so the script works whether invoked via
# `pnpm test:e2e` (node_modules/.bin on PATH) or directly as `bash run-e2e.sh`.
PLAYWRIGHT="${SCRIPT_DIR}/node_modules/.bin/playwright"
if [[ ! -x "${PLAYWRIGHT}" ]]; then PLAYWRIGHT="playwright"; fi

# Targeted/debug run (any args = filter): keep it serial (workers=1) so a
# focused run is deterministic and cheap.
if [[ "$#" -gt 0 ]]; then
    export E2E_WORKERS="${E2E_WORKERS:-1}"
    echo "[integration] Targeted run (workers=${E2E_WORKERS}): $*"
    exec "${PLAYWRIGHT}" test -c "${CONFIG}" --project=all "$@"
fi

# Full run: fan out across E2E_WORKERS fully-isolated worlds (one Foundry
# server+world+port each → zero cross-worker contention). One Playwright
# invocation → one .e2e-results.json + one coverage stream (so e2e:coverage /
# e2e:ratchet see every spec). Clear accumulated coverage artifacts so the
# report reflects only this run (nothing else truncates them).
#
# Default auto-scales to the box's CURRENT headroom (scripts/auto-workers.sh):
# GPU on (default) offloads rendering to the host GPU/VRAM, so each worker is
# light on both CPU (~3 load) and system RAM (~3-4G) — measured at 4 workers:
# load ~12, avail steady — hence 4G and 3 threads per worker, which saturates
# the CPU while staying inside free RAM. Software WebGL is RAM-heavy (~6.3G a
# worker), hence 7G. Override with E2E_WORKERS (E2E_WORKERS=1 forces the
# historical serial run).
if [[ -z "${E2E_WORKERS:-}" ]]; then
    if [[ "${E2E_GPU:-1}" != "0" ]]; then _gb_per_worker=4; else _gb_per_worker=7; fi
    E2E_WORKERS="$(bash "${SCRIPT_DIR}/scripts/auto-workers.sh" "${_gb_per_worker}" 3)"
    export E2E_WORKERS
    echo "[integration] auto-scaled workers=${E2E_WORKERS} (threads=$(nproc), avail=$(free -g | awk 'NR==2{print $7}')G)"
fi
echo "[integration] Full run (isolated worlds, workers=${E2E_WORKERS})…"
rm -rf "${SCRIPT_DIR}/.e2e-raw-coverage" "${SCRIPT_DIR}/.e2e-runtime-coverage.jsonl"
exec "${PLAYWRIGHT}" test -c "${CONFIG}" --project=all
