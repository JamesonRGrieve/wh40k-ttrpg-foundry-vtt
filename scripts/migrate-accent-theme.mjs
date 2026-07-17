// #422 — route the inline 7-system text-accent chain through the themeClassFor SSOT.
//
// Replaces the ONE canonical accent chain (whose per-system colours are byte-identical
// to each `<id>-config.ts` `theme.accent` value, and all 7 are safelisted in
// tailwind.config.js) with `{{themeClassFor 'accent'}}`. Because the emitted colour
// per system is identical, this is a zero-visual-change dedup.
//
// SCOPE: sheet-root templates only. Chat / prompt / dialogs render without a
// `_gameSystemId` on `@root`, so the helper would fall back to the RT accent there
// (a regression) — those surfaces are deferred until the system id reaches their
// render context. Drifted accent chains (5 other spellings) are also left alone: they
// would change colour, a per-site judgement, not a mechanical swap.
//
// Single quotes in the helper call (`'accent'`) avoid colliding with the surrounding
// `class="..."` double-quote attribute.
//
// Run: node scripts/migrate-accent-theme.mjs [--apply]

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const CANONICAL_ACCENT_CHAIN =
    'bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5 dh2:tw-text-gold-raw dw:tw-text-accent-combat ow:tw-text-brass-l20 rt:tw-text-gold im:tw-text-failure';
const REPLACEMENT = "{{themeClassFor 'accent'}}";
// Allowlist the two directories that are GUARANTEED to render under an item/actor
// sheet root (where `@root._gameSystemId` is always present). Everything else — chat,
// prompt, dialogs, shared partials, HUD, app popouts — is deferred to the phase that
// first threads the system id into those render contexts, so the helper never falls
// back to the RT accent (a regression).
const ALLOWED_DIRS = /^src\/templates\/(actor|item)\//;

const apply = process.argv.includes('--apply');
let filesChanged = 0;
let sitesConverted = 0;

for (const path of walkFiles('src/templates', { ext: '.hbs' })) {
    if (!ALLOWED_DIRS.test(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (!text.includes(CANONICAL_ACCENT_CHAIN)) continue;
    const occurrences = text.split(CANONICAL_ACCENT_CHAIN).length - 1;
    sitesConverted += occurrences;
    filesChanged++;
    if (apply) {
        writeFileSync(path, text.split(CANONICAL_ACCENT_CHAIN).join(REPLACEMENT));
    }
    console.log(`${apply ? 'converted' : 'would convert'} ${occurrences.toString().padStart(2)} in ${path}`);
}

console.log(`\n${apply ? 'Converted' : 'Would convert'} ${sitesConverted} site(s) across ${filesChanged} sheet-root template(s).`);
if (!apply) console.log('Re-run with --apply to write.');
