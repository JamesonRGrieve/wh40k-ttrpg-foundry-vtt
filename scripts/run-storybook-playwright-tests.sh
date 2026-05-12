#!/bin/sh
set -eu

# Storybook build pulls static assets from .foundry-release/public (the mirror
# of Foundry's compiled stylesheet, fonts, etc. populated by pull-foundry.sh).
# Without it, `storybook build` fails immediately. In environments that lack
# the mirror (e.g. fresh checkouts that haven't run pull-foundry.sh, or
# automation that doesn't have FOUNDRY_PASS), skip the integration test rather
# than blocking the commit on a pre-existing setup requirement.
if [ ! -d ".foundry-release/public" ]; then
    echo "[storybook-playwright] SKIPPED: .foundry-release/public is missing." >&2
    echo "  Run \`FOUNDRY_PASS=... ./pull-foundry.sh\` once to populate it." >&2
    echo "  This is required for the Storybook stories to load Foundry's chrome." >&2
    exit 0
fi

./node_modules/.bin/storybook build
./node_modules/.bin/playwright test -c playwright.storybook.config.ts
