#!/usr/bin/env bash
#
# check-parallel.sh — run the gate suite concurrently across CPU threads instead
# of the sequential `pnpm check` chain. Every gate runs as its own background job
# writing to a per-gate log; the script waits for all, prints a PASS/FAIL +
# duration summary, and exits non-zero if any gate failed.
#
# Wall-clock ≈ the slowest single gate (the browser poles: e2e + storybook),
# with every CPU-bound gate (typecheck / lint / knip / deps / strict / vitest /
# …) overlapped underneath it — vs the sum of all of them run in series.
#
# NOTE on contention: the two browser poles (Tier B e2e and the Storybook
# Playwright suite) both render via chromium and are CPU-heavy. On a busy box
# they compete; skip either with --no-e2e / --no-storybook for a fast
# code-gate-only pass. e2e itself fans out per E2E_WORKERS (see run-e2e.sh).
#
# Usage:
#   bash scripts/check-parallel.sh                 # all gates incl. e2e + storybook
#   bash scripts/check-parallel.sh --no-e2e        # skip Tier B e2e
#   bash scripts/check-parallel.sh --no-storybook  # skip Storybook visual suite
#   bash scripts/check-parallel.sh --gates-only    # neither browser pole
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${SCRIPT_DIR}"

WITH_E2E=1
WITH_STORYBOOK=1
for arg in "$@"; do
    case "${arg}" in
        --no-e2e) WITH_E2E=0 ;;
        --no-storybook) WITH_STORYBOOK=0 ;;
        --gates-only) WITH_E2E=0; WITH_STORYBOOK=0 ;;
        *) echo "unknown arg: ${arg}" >&2; exit 2 ;;
    esac
done

LOGDIR="$(mktemp -d -t check-parallel-XXXXXX)"
PNPM="pnpm"
command -v pnpm >/dev/null 2>&1 || PNPM="${HOME}/.local/bin/pnpm"

declare -a NAMES STARTS
declare -A CMDS

# Code-gate lane: CPU-bound, each typically well under the browser poles.
CMDS[typecheck]="${PNPM} typecheck"
CMDS[typecheck-tests]="${PNPM} typecheck:tests"
CMDS[lint]="${PNPM} lint:ratchet"
CMDS[biome]="${PNPM} biome:ratchet"
CMDS[css]="${PNPM} css:ratchet"
CMDS[plugin-audit]="${PNPM} css:plugin-audit"
CMDS[animation]="${PNPM} animation:ratchet"
CMDS[theme]="${PNPM} theme:ratchet"
CMDS[important]="${PNPM} important:ratchet"
CMDS[ts]="${PNPM} ts:ratchet"
CMDS[strict]="${PNPM} strict:ratchet"
CMDS[test-typecheck]="${PNPM} test:typecheck:ratchet"
CMDS[type-coverage]="${PNPM} type-coverage:ratchet"
CMDS[knip]="${PNPM} knip:ratchet"
CMDS[deps]="${PNPM} deps:ratchet"
CMDS[lockfile]="${PNPM} lockfile:validate"
CMDS[i18n]="${PNPM} i18n:check"
CMDS[symmetry]="${PNPM} symmetry:ratchet"
CMDS[preload]="${PNPM} preload:drift"
CMDS[dry-todo]="${PNPM} dry-todo:ratchet"
CMDS[vitest]="${PNPM} test"
ORDER=(typecheck typecheck-tests lint biome css plugin-audit animation theme important ts strict test-typecheck type-coverage knip deps lockfile i18n symmetry preload dry-todo vitest)

# Browser poles (opt-out via flags).
if [[ "${WITH_STORYBOOK}" == "1" ]]; then CMDS[storybook]="${PNPM} test:storybook:integration"; ORDER+=(storybook); fi
if [[ "${WITH_E2E}" == "1" ]]; then CMDS[e2e]="${PNPM} test:e2e"; ORDER+=(e2e); fi

echo "[check:parallel] launching ${#ORDER[@]} gates concurrently (logs: ${LOGDIR})"
declare -A PIDS
for name in "${ORDER[@]}"; do
    ( eval "${CMDS[$name]}" >"${LOGDIR}/${name}.log" 2>&1; echo $? >"${LOGDIR}/${name}.exit" ) &
    PIDS[$name]=$!
done

wait

FAIL=0
echo ""
echo "================ check:parallel summary ================"
for name in "${ORDER[@]}"; do
    ec="$(cat "${LOGDIR}/${name}.exit" 2>/dev/null || echo '?')"
    if [[ "${ec}" == "0" ]]; then
        printf '  \033[32mPASS\033[0m  %s\n' "${name}"
    else
        printf '  \033[31mFAIL\033[0m  %s  (exit %s — %s)\n' "${name}" "${ec}" "${LOGDIR}/${name}.log"
        FAIL=1
    fi
done
echo "======================================================="
[[ "${FAIL}" == "0" ]] && echo "[check:parallel] all gates passed" || echo "[check:parallel] FAILURES above — see logs in ${LOGDIR}"
exit "${FAIL}"
