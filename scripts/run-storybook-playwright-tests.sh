#!/bin/sh
set -eu

# Storybook chrome is provided by stories/css/foundry-chrome.css (reimplemented
# via tailwind.storybook.config.js) — no `.foundry-release/` dependency. The
# full build + Playwright integration suite runs from a clean checkout.

# Fan the pixel suite out to the box's current headroom (scripts/auto-workers.sh:
# ~2G RAM and 2 threads per chromium screenshot worker) unless STORYBOOK_WORKERS
# pins it. It no longer runs inside pre-commit, so it has the machine to itself.
if [ -z "${STORYBOOK_WORKERS:-}" ]; then
    STORYBOOK_WORKERS="$(bash ./scripts/auto-workers.sh 2 2)"
    export STORYBOOK_WORKERS
    echo "[storybook] auto-scaled workers=${STORYBOOK_WORKERS}"
fi

./node_modules/.bin/storybook build
./node_modules/.bin/playwright test -c playwright.storybook.config.ts
