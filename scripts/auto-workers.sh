#!/usr/bin/env bash
#
# auto-workers.sh — print how many parallel test workers this box can run RIGHT
# NOW, from its current headroom.
#
# Usage: auto-workers.sh <gb-per-worker> <threads-per-worker> [max]
#
# Workers = min(available RAM / gb-per-worker, hardware threads / threads-per-worker),
# clamped to [1, max] (max defaults to the hardware thread count). Keying off
# *available* (not total) memory adapts to whatever else shares the box, so a
# run fans out wide on an idle machine and narrows instead of OOMing on a busy
# one. Shared by the Tier B e2e runner and the Storybook pixel suite.
set -euo pipefail

if [[ "$#" -lt 2 ]]; then
    echo "usage: $0 <gb-per-worker> <threads-per-worker> [max]" >&2
    exit 2
fi
gb_per_worker="$1"
threads_per_worker="$2"
threads="$(nproc 2>/dev/null || echo 4)"
max="${3:-${threads}}"
avail_gb="$(free -g 2>/dev/null | awk 'NR==2{print $7}')"
avail_gb="${avail_gb:-8}"

by_mem=$(( avail_gb / gb_per_worker ))
by_cpu=$(( threads / threads_per_worker ))
workers=$(( by_mem < by_cpu ? by_mem : by_cpu ))
(( workers < 1 )) && workers=1
(( workers > max )) && workers="${max}"
echo "${workers}"
