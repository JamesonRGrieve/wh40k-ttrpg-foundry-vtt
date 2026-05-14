#!/bin/sh
set -eu

# Storybook chrome is provided by stories/css/foundry-chrome.css (reimplemented
# via tailwind.storybook.config.js) — no `.foundry-release/` dependency. The
# full build + Playwright integration suite runs from a clean checkout.

./node_modules/.bin/storybook build
./node_modules/.bin/playwright test -c playwright.storybook.config.ts
