# Claude Code Instructions — wh40k-rpg

This is the **Warhammer 40K RPG** Foundry VTT system. It implements seven d100-family 40K tabletop RPGs — six FFG-era lines (Black Crusade [BC], Dark Heresy 1e [DH1], Dark Heresy 2e [DH2], Deathwatch [DW], Only War [OW], Rogue Trader [RT]) plus Cubicle 7's Imperium Maledictum (IM) — on Foundry **V14**, in TypeScript.

DH2 is the canonical default of the FFG family (the bare `header-dh.hbs`); DH1 is a separate variant (`header-dh1.hbs`). IM shares the d100 roll-under engine but layers Patrons, Factions, Endeavours, and WFRP-style critical hits over it; its divergences are opt-in via `*-im.hbs` templates and `im-*` DataModels. Actor types follow `<system>-<role>` (e.g., `dh2-character`, `dh1-npc`, `im-character`, `rt-starship`).

---

## Direction (every change must advance these)

These are not optional polish items. Every PR, refactor, and new component must move the codebase in these directions, or it does not land. A change that is neutral on all seven is suspicious — ask whether it's worth doing.

1. **Full strong TypeScript coverage.** No new `any`. No new `@ts-ignore` / `@ts-expect-error` (existing suppressions may stay until the underlying issue is fixed, but every PR should reduce, not grow, that count). Migrate any `.js` / `.mjs` you touch to `.ts`. New code is fully typed at signatures and return values; prefer narrow types over `unknown`. **Never resort to `any`** for convenience, even for complex hook signatures; use generics (`<T extends Function>`) or precise interfaces. **Fix the root cause, not the symptom**: if the compiler complains about a 'possibly undefined' property, do not sprinkle null coalescers (`??`) or optional chaining (`?.`) throughout the logic. Instead, tighten the underlying DataModel or interface definitions so the compiler can safely infer property existence. Inference is always preferred over casting.

2. **Full migration from CSS/SCSS to Tailwind.** New styling uses `tw-` utility classes inline on templates and PARTS classes — no new rules in `src/css/`, no new SCSS files. When you edit a `.hbs` template, opportunistically port its existing CSS rules to inline Tailwind and remove the now-unused selectors. The CSS pipeline is being phased out.

3. **Full homologated support of all 7 game systems.** BC, DH1, DH2, DW, OW, RT, IM all share data structure, behavior, and visual treatment. Per-system divergence is opt-in via explicit per-system templates (e.g., `header-bc.hbs`, `header-rt.hbs`, `header-im.hbs`) or explicit branching — never accidental. A change that improves one system must improve, or at minimum not regress, the other six. When you add a feature, verify it works across all seven before considering the work done. IM-specific surfaces (Patrons, Factions, Endeavours, critical-hit tables) are scoped extensions, not exceptions to homologation — the underlying actor / item / roll plumbing stays shared.

4. **Full DRY.** No copy-paste between sheets, mixins, templates, helpers, or DataModels. Extract partials, mixins, and utility functions. If you write similar logic twice, the third time you extract — and prefer extracting on the second instance when the abstraction is obvious.

5. **Resolve ESLint warnings in any file you touch.** Any time you edit a file, run ESLint on it and clear every warning it reports — not just warnings on the lines you changed. "Touched" means any edit, not a full rewrite. This is how the lint baseline ratchets down over time; leaving pre-existing warnings in a file you just modified is a regression of intent even when the count doesn't rise. If a warning genuinely cannot be fixed without scope creep, surface it explicitly rather than ignoring it.

6. **All player-facing strings live in the langpack.** Any string a user can read in the UI — labels, tab names, button text, tooltips, placeholders, dialog titles, validation/error messages, chat card text, notifications — must be a localization key resolved through `src/lang/en.json` and namespaced under `WH40K.*`. Use `{{localize "WH40K.…"}}` (or `{{#localize}}…{{/localize}}` for inline blocks) in Handlebars and `game.i18n.localize(...)` / `game.i18n.format(...)` in TypeScript. Hard-coded English in templates, sheet `DEFAULT_OPTIONS.window.title`, `static TABS[].label`, action method strings, or `ui.notifications.*` calls is a regression and must be ported the moment you touch the surrounding code. Add new keys to `en.json` in the same PR; never reference a key that doesn't exist. Internal identifiers (CSS classes, action names, schema field paths, data-* attributes, log messages, dev-only console output) are not player-facing and stay as plain strings.

7. **Compendiums are the single source of truth for all content data.** Every item, skill, talent, trait, origin-path, weapon, condition, psychic power, and rules-mechanic value that is *specific to game content* lives in a compendium pack `_source/*.json` document — never hardcoded in `src/`. No content-specific deltas, thresholds, name strings, identifier registries, or per-entry mechanic tables in TypeScript. System code holds only content-agnostic primitives: pure math, enums of non-content mechanics (e.g. `'manual'` / `'inquest'` adjustment kinds), schema shapes, and resolution plumbing. When a feature needs a content value, add a structured field to the relevant shared item template/DataModel and read it at runtime by walking the actor's owned items / origin path (kept current by the boot-time compendium→world resync in `src/module/compendium-resync.ts`) and resolving labels through `uuidNameCache` — never by string-matching a name or hand-maintaining a parallel registry in code. Content-agnostic primitive labels must be namespaced *outside* the content i18n tree (`WH40K.Subtlety.ManualAdjustment`, not `WH40K.Subtlety.Source.*`). A PR that introduces a content-specific constant, string literal, or lookup table into `src/` is a regression even if it passes every other gate.

---

## Testing & visual coverage (required for every component)

These are not aspirational. Code without these is incomplete.

- **Vitest covers all functionality.** Pure logic (calculators, processors, validators), DataModel methods, Document methods, helpers, and mixin behaviors all get unit tests. `pnpm test` must pass before commit. Tests live in `tests/` (separate from `src/` so the build never ships them) or co-located as `*.test.ts`. Use `pnpm scaffold:test <path-to-source.ts>` to generate a co-located skeleton.
- **Storybook stories for every component.** Sheets, dialogs, partials, chat cards, HUD widgets, prompts — each gets a `*.stories.ts`. Stories use the factories in `stories/mocks/` (and the additions in `stories/mocks/extended.ts` for NPC / Vehicle / Starship and per-system variants) to produce realistic mock data; do not hand-author 200-field mock objects per story. Use `pnpm scaffold:story <path-to-source.ts>` to generate a skeleton, and the helpers in `stories/test-helpers.ts` (`renderSheet`, `renderSheetParts`, `clickAction`, `submitForm`, `assertActiveTab`, `assertField`) instead of hand-wiring Handlebars compilation per story.
- **Interactive unit testing in stories.** Stories with behavior use Storybook's `play` function (or Vitest + happy-dom against the rendered output) to assert on clicks, form submission, action dispatch, and drag/drop where applicable. A "renders without throwing" story is not enough for a component with interactivity.
- **CSS composition testing.** Full-sheet stories render multiple partials together (header + tabs + panels) so layout regressions, theme cascade breaks, and Tailwind class conflicts show up in visual review. Single-partial stories alone do not satisfy this. Use `renderSheetParts(...)` from `stories/test-helpers.ts` for the composed-tree pattern.
- **Live partials must be preloaded.** If a sheet or dialog references a new Handlebars partial at runtime, also add it to `HandlebarManager.preloadHandlebarsTemplates()` in `src/module/handlebars/handlebars-manager.ts`. Storybook's glob-based partial registration can hide this mistake; Foundry runtime will not. The `preload-drift` gate (run pre-commit) catches the omission for you — if it fails, fix the preload list, do not silence the gate.
- **Per-system homologation in stories.** When a story exercises actor or item data, run it through `withSystem(actor, 'im')` (and the other six system IDs) at least once so DH2-only assumptions surface. Without per-system mocks, "works in DH2 but not the other six" regressions are invisible.
- **Seeded RNG in stories and tests.** Replace `Math.random()` calls in stories/mocks with `randomId(prefix, rng)` from `stories/mocks/extended.ts`, seeded via `seedRandom(seed)`. Determinism makes screenshot diffs and `play`-function assertions stable across runs.

When you add a component, the story and tests are part of the same PR. When you fix a component, also add the story/tests if they don't exist — leave the area better covered than you found it. The `coverage-symmetry` ratchet (pre-commit) blocks commits where missing-pair counts increase.

### Integration tiers (opt-in to licensed Foundry)

Two extra suites layer on top of the unit + storybook-playwright surfaces. Both are **opt-in** and key off the presence of `.foundry-release/` (gitignored, populated by `./pull-foundry.sh`). When the licensed install is absent, both suites print a skip banner and exit 0; set `FOUNDRY_INTEGRATION=required` to convert the skip into a hard error (use this in the licensed CI lane).

- **Tier A — `pnpm test:integration`.** Vitest under jsdom that loads `.foundry-release/public/scripts/foundry.js`, stubs canvas / WebGL / IndexedDB, drives the init pipeline, then asserts against real Documents / DataModels / sheets. Catches V14 `cleanData(_state)` regressions, `registerSheet` anonymous-class collisions, and per-system DataModel registration breaks. Tests live in `tests/integration/*.test.ts`; the boot harness is `tests/integration/lib/boot.ts`. Boot is best-effort — if Foundry refuses to init under jsdom, the harness records the error and individual tests skip rather than fail the suite.
- **Tier B — `pnpm test:e2e`.** Playwright spawns the real Foundry server (`node .foundry-release/main.js`) against an ephemeral data dir at `.foundry-release/data-test/` with the working tree's `dist/` symlinked in as the system. Tests drive the GM-only seed world, create actors per game system, and assert on chat-card DOM (catching the `.wh40k-rpg` ancestor regression noted under "Adaptation procedure" 3a). Config is `playwright.foundry.config.ts`; provisioning is `scripts/setup-foundry-test-world.sh`.

Neither tier runs pre-commit (Tier A is 30s+ to boot, Tier B is minutes). They run only when invoked explicitly or by the licensed CI lane. The `integration:ratchet` (case count cannot fall) keeps Tier A coverage from being silently deleted; Tier B is intentionally not ratcheted (failures are binary "server didn't boot" signals, not coverage to drive down).

---

## Coverage metrics & ratchets

Every direction in the previous section is backed by a coverage script and a ratchet. The ratchets enforce a one-way valve: any PR may improve a metric, no PR may regress one. When a metric drops, run the matching `*:ratchet:update` to lower the baseline in the same commit. The pre-commit hook runs all ratchets in sequence; bypassing with `--no-verify` requires explicit user authorization.

### Ratchet inventory

| Direction | Coverage script | Ratchet | Baseline file |
| --- | --- | --- | --- |
| Tailwind migration | `pnpm css:coverage` | `pnpm css:ratchet` | `.css-coverage-baseline` |
| Animation migration (`animation:` rule → `tw-animate-<name>`) | `pnpm animation:coverage` | `pnpm animation:ratchet` | `.animation-baseline` |
| Per-system theme adoption (`<system>:tw-*` variants) — count must NOT FALL | `pnpm theme:coverage` | `pnpm theme:ratchet` | `.theme-baseline` |
| Strong TS suppression markers (per-rule, per-dir, **auto-flips to strict at 0**) | `pnpm ts:coverage` | `pnpm ts:ratchet` | `.ts-coverage-baseline` |
| `tsc --noEmit` total errors against main tsconfig | (hard gate — must be zero) | `pnpm typecheck` | — |
| `tsc --noEmit` against `tsconfig.strict.json` (noImplicitOverride, noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature, exactOptionalPropertyTypes, etc.) — **per-TS-code, auto-flips to strict at 0** | `pnpm strict:coverage` | `pnpm strict:ratchet` | `.strict-coverage-baseline` |
| `tsc --noEmit` against `tsconfig.test.json` (tests + stories, excluded from the main typecheck) — **per-TS-code, auto-flips to strict at 0** | `pnpm test:typecheck:coverage` | `pnpm test:typecheck:ratchet` | `.test-typecheck-baseline` |
| Inferred type-coverage % (`type-coverage --strict`; covered count cannot fall, **auto-flips to strict at 100%**) | `pnpm type-coverage` | `pnpm type-coverage:ratchet` | `.type-coverage-baseline` |
| `knip` per-category unused detection (files, exports, types, deps, binaries, …) — **per-category, auto-flips to strict at 0** | `pnpm knip` | `pnpm knip:ratchet` | `.knip-baseline` |
| Dependency-cruiser 3-layer + correctness rules (sheets ↛ data, docs ↛ apps, no-circular, no-test-into-prod, no-orphans, …) — **per-rule, auto-flips to strict at 0** | `pnpm deps:check` | `pnpm deps:ratchet` | `.depcruise-baseline` |
| ESLint warnings (strong config over `src/module/ src/templates/ stories/ tests/` — app, story, and test code, same ruleset) | (built into ratchet) | `pnpm lint:ratchet` | `.eslint-warning-baseline` |
| Biome diagnostics (errors + warnings) | (built into ratchet) | `pnpm biome:ratchet` | `.biome-warning-baseline` |
| Sheet → story / data → test pairing | `pnpm symmetry` | `pnpm symmetry:ratchet` | `.symmetry-baseline` |
| `!important` in `tailwind/*.js` | `pnpm important:coverage` | `pnpm important:ratchet` | `.important-baseline` |
| Preload-list integrity (Handlebars partials) | `pnpm preload:drift` | hard gate (no ratchet) | — |
| Dead `tailwind/*.js` rules (no live `wh40k-*` consumer) | `pnpm css:plugin-audit` | hard gate (no ratchet) | — |
| i18n key codegen freshness | `pnpm i18n:check` | hard gate (auto-regen pre-commit) | — |
| `pnpm-lock.yaml` resolution host allow-list | `pnpm lockfile:validate` | hard gate (no ratchet) | — |
| Tier B e2e: `passed` count + per-dimension % + source coverage (lines / statements / functions / branches). Per-dimension **auto-flips to strict at 100%**. Not in pre-commit; runs in the licensed CI lane only. | `pnpm e2e:coverage` | `pnpm e2e:ratchet` | `.e2e-baseline` |

The hard gates (preload-drift, plugin-audit, i18n, lockfile-validate) cannot be ratcheted because regression is a real bug, not a velocity tradeoff. Fix the underlying issue. The plugin-audit gate specifically guards against the addBase dedup trap: a rule that's "dead by class" is invisible at the source level but a rule that's "dead by cascade" silently shadows live rules — extending the audit to walk nested selectors keeps the lights-on selector inventory honest.

#### Auto-flip semantics ("graduates to strict")

Several ratchets (`lint:ratchet`, `ts:ratchet`, `strict:ratchet`, `test:typecheck:ratchet`, `knip:ratchet`, `deps:ratchet`, `type-coverage:ratchet`, `e2e:ratchet`) implement the same auto-flip pattern: when a per-rule / per-code / per-category count reaches 0 (or, for `e2e:ratchet`, when a per-dimension percentage reaches 100), the baseline file records it in `"strict": [...]` and any future occurrence is a **hard fail** with no `--update` escape hatch. The ratchet continues to function normally for everything still above 0.

This is the explicit shape of "ratchet → hard gate" promotion: a metric earns its way into hard-gate status by being driven to 0, and once there the invariant is enforced like any other hard gate. The promotion is automatic the next time the ratchet runs — no separate config change needed. To un-strict a metric you must manually edit the baseline file and explain why in the commit; it's an explicit demotion, not a quiet revert.

**`lint:ratchet` is the ESLint instance of this pattern, with one extra move.** It tracks per-rule warning counts over the full surface (`src/module/ src/templates/ stories/ tests/`). When a rule *we configure as `warn`* in `.eslintrc.json` reaches 0 occurrences it graduates: the ratchet records it in `.eslint-warning-baseline`'s `strict` list **and rewrites `.eslintrc.json`, flipping that rule's severity `warn` → `error`** (preserving its options array), so ESLint itself enforces it from the next run onward — a graduated rule's reappearance is then a plain ESLint *error*, which the ratchet refuses to pass regardless. This flip happens automatically on **every** `lint:ratchet` run (the pre-commit hook calls it), not only under `--update`, exactly like `ts:ratchet` persisting graduations in check mode. Commit the modified `.eslintrc.json` and `.eslint-warning-baseline` together. Rules at `warn` only via an extended config (not literally in `.eslintrc.json`) are *not* auto-flipped — graduate them by adding an explicit entry. Non-strict rules ratchet per-rule (no rule may rise above its baseline) plus an aggregate-total guard; `pnpm lint:ratchet:update` rebaselines the non-strict rules and is the required step after a scope change or a genuine reduction. The `.eslint-warning-baseline` is JSON (`{ strict, total, byRule }`); a legacy bare-integer baseline is migrated automatically on first run.

State at the time of writing:
  - `tsIgnore` (under `ts:ratchet`) has already graduated. `@ts-ignore` is forbidden — use `@ts-expect-error` with an inline reason.
  - `knip:ratchet` has graduated `binaries`, `classMembers`, `enumMembers`, `namespaceMembers`, `optionalPeerDependencies`, `unlisted`, `unresolved`.
  - `strict:ratchet`, `test:typecheck:ratchet`, `deps:ratchet`, `type-coverage:ratchet` have no graduations yet — they ratchet down from initial baselines.
  - `e2e:ratchet` graduates each dimension that reaches 100%; the next `--update` records the graduation in `.e2e-baseline`'s `strict` list and locks the dimension at 100% thereafter.
  - `lint:ratchet` graduated ~80 ESLint rules to `error` the first run after test/story code entered the lint surface (the full set is the `strict` list in `.eslint-warning-baseline` — it is the source of truth, not this list). The rules still at `warn` are the ones with live occurrences (the `no-unsafe-*` family, `no-unnecessary-condition`, `no-restricted-syntax`, `@typescript-eslint/no-shadow`, `strict-boolean-expressions`, `prettier/prettier`, `import/order`, etc.); drive these down and they graduate the same way.

#### Strict-flag tsconfig (`tsconfig.strict.json`)

The main `tsconfig.json` is kept at zero tsc errors (hard gate). The "next-tier" strictness flags that would surface real errors today live in a separate `tsconfig.strict.json` extending the main config:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true
  }
}
```

`pnpm strict:ratchet` runs tsc against this config, counts errors per TS error code, and ratchets each code down independently. When a code reaches 0 it graduates to strict (count must remain 0 thereafter) — at which point its underlying flag is effectively enforced even though it still lives in `tsconfig.strict.json` rather than the main config. Once **every** TS code under tsconfig.strict.json has graduated, the flags can be moved into `tsconfig.json` proper and `tsconfig.strict.json` deleted — the migration is complete.

Approximate flag → TS code mapping:
  - `noImplicitOverride` → TS4114
  - `noFallthroughCasesInSwitch` → TS7029
  - `forceConsistentCasingInFileNames` → TS1149
  - `noImplicitReturns` → TS7030
  - `noUncheckedIndexedAccess` → TS18048, TS2532, TS2538, TS2722
  - `noPropertyAccessFromIndexSignature` → TS4111
  - `exactOptionalPropertyTypes` → TS2375, TS2379, TS2412

Some codes (TS2322, TS2345) cross-bleed across flags; the ratchet's per-code accounting tolerates this without needing a mapping table — every code's count must monotonically drop.

#### Test/story typecheck (`tsconfig.test.json`)

Tests and stories are outside the main tsconfig's `include` (they import `vitest/globals`, hand-author mock objects, etc.). `tsconfig.test.json` adds them to the include set so they participate in a typecheck. `pnpm test:typecheck:ratchet` ratchets the result down per TS code with the same auto-flip semantics. `pnpm typecheck:tests` runs the same pass as a plain gate and is part of `pnpm check`; the baseline is at zero with every TS code graduated to strict, so any test/story type error is a hard fail — fix the root cause, do not exclude the file.

`tsconfig.test.json` is also the **single ESLint parser project** (`.eslintrc.json` → `parserOptions.project`). It is a superset of `tsconfig.json` (it `extends` it and adds the test/story globs), so type-checked ESLint rules resolve for `src/module/**`, `src/templates/**/*.stories.ts`, `stories/**`, and `tests/**` from one program. There is no separate weak lint config for tests/stories — test and story code is held to the **same strong ruleset as application code** (the old `.eslintrc.stories.json` / `lint:stories` path was removed). `*.test.ts` additionally gets the `@vitest/*` rules; `*.stories.ts` additionally gets `plugin:storybook/recommended`. `pnpm lint` and `pnpm lint:ratchet` both cover `src/module/ src/templates/ stories/ tests/`; the `.eslint-warning-baseline` count therefore spans that whole surface. Biome stays scoped to `src/module/` (its `useFilenamingConvention` kebab-case rule conflicts with Storybook's PascalCase story-file convention; do not broaden `biome.json` `includes` without resolving that first).

#### `@total-typescript/ts-reset`

`src/module/types/ts-reset.d.ts` pulls in `@total-typescript/ts-reset`, which tightens built-in lib types:
  - `JSON.parse()` and `Response.json()` return `unknown` (not `any`).
  - `Array.isArray` narrows to `readonly unknown[]` (no silent `any[]` widening).
  - `.filter(Boolean)` narrows to the truthy variant.
  - `Set.has` / `Array.includes` accept wider types (no false-negative narrowing).

Combined with the boundary `unknown` rule in `.eslintrc.json` (no `unknown` past a Zod parse / type-guard), this pushes external input through explicit validation instead of letting it leak as `any` through framework gaps.

#### Architecture rules (`dependency-cruiser`)

`.dependency-cruiser.cjs` declares the 3-layer architecture as machine-checkable rules:
  - `sheets-must-not-import-data-models-directly` — applications/ may not reach into data/ except for `import type`.
  - `data-must-not-depend-on-applications` — DataModels are pure logic, no UI imports.
  - `documents-must-not-depend-on-applications` — Documents expose API, no UI imports.
  - Plus baseline correctness: `no-circular`, `no-orphans`, `no-test-into-prod`, `no-non-package-json`, `no-deprecated-core`.

All rules currently emit at `warn` level because the codebase has pre-existing violations (mostly Documents reaching into prompt dialogs from the roll API). The ratchet (`pnpm deps:ratchet`) gates regression and auto-flips each rule to strict at 0 — at which point the rule's severity in `.dependency-cruiser.cjs` can be promoted to `error` and the ratchet's enforcement is redundant.

### CSS architecture

Styling is now expressed almost entirely through Tailwind configuration patterns. The complete inventory of CSS-bearing files in this repo:

- `src/css/entry.css` — sole CSS source. Twelve lines: Google Fonts `@import url(...)` + the three `@tailwind base/components/utilities` directives. Do not add rules here.
- `tailwind.config.js` — Tailwind v3 config with `important: '.wh40k-rpg'` (utility specificity) and `prefix: 'tw-'` (utility namespace). Animations live under `theme.extend.keyframes` / `theme.extend.animation`. Per-system variants (`bc:`, `dh1:`, `dh2:`, `dw:`, `ow:`, `rt:`, `im:`) live in the `addVariant` plugin call.
- `tailwind/*.js` — nine CSS-in-JS plugin objects, registered via a single `addBase(...)` call. They hold (a) the `:root`/`body.theme-*` design tokens (`design-tokens.js`) and (b) every legacy gothic-theme component class (`panel-components.js`, `legacy-components.js`, `item-preview.js`, `wh40k-tooltip.js`, `compendium-browser.js`, `npc-sheet.js`, `foundry-chrome.js`, `weapon.js`).

Why `addBase` and not `addComponents`: Tailwind's `prefix: 'tw-'` config prepends `tw-` to every class registered through `addComponents`, mangling the bare `wh40k-*` class names that templates author. `addBase` emits selectors literally and produces the cascade order we want (legacy components → utilities), since `@tailwind base` precedes `@tailwind utilities` in `entry.css`.

Adding new component CSS to `tailwind/*.js` should be the exception, not the rule. Prefer:
- inline `tw-*` utilities on `.hbs` templates / sheet PARTS classes for one-off layout;
- `addComponents({ '.form-group': ... })` in `tailwind.config.js` for shared form/dialog patterns that templates write WITHOUT the `tw-` prefix only when they're system-internal scaffolding (utility classes that benefit from the prefix go through `addUtilities` instead);
- `theme.extend.keyframes` + `theme.extend.animation` for new animations so `tw-animate-foo` resolves.

The `tailwind/*.js` plugin files are the absorbed tail of an old `src/css/**.css` tree — they are migration debt, not the target architecture. Each one remains a candidate for inline-Tailwind porting per `docs/tailwind-migration.md`. Once a file's rules are fully ported (every consumer template uses bare utilities), delete the file and remove its require from `tailwind.config.js`.

The CSS variable → Tailwind utility translation map is `scripts/css-token-map.json`. Extend this file when a new variable becomes worth a token rather than re-deriving on every port.

### Animation migration tooling

All `@keyframes` definitions live in `tailwind.config.js` under `theme.extend.keyframes`, with paired entries in `theme.extend.animation`. Each animation generates a `tw-animate-<name>` utility class.

Some legacy gothic-theme components in `tailwind/*.js` still carry `animation: <name> ...` declarations (e.g. on `.wh40k-panel-*` or weapon-sheet selectors). Those declarations reference the keyframes by name and continue to work via the cascade. A `safelist: [{ pattern: /^tw-animate-/ }]` entry in `tailwind.config.js` forces every `tw-animate-*` utility (and its `@keyframes`) to be emitted regardless of template usage, so the legacy rules don't break when no template references the utility yet. **Drop the safelist once every animation is invoked via `tw-animate-<name>` on its template AND the matching `animation:` declaration is removed from the legacy plugin files.**

- `pnpm animation:coverage` — counts `animation:` / `animation-name:` declarations across every CSS file under `src/css/**/*.css`. Output at `.animation-coverage.json`. (When the legacy plugin files in `tailwind/*.js` move back to CSS for porting, or when a port adds rules to a new CSS file, both surfaces are covered.)
- `pnpm animation:ratchet` — pre-commit gate; baseline at `.animation-baseline`. Update via `pnpm animation:ratchet:update` after a port.
- Per-template port: replace each `animation: <name> ...` declaration applied via a class with `tw-animate-<name>` on the consuming element. Delete the source declaration. Run `pnpm animation:ratchet:update` and commit.
- **Pseudo-element animations are refactored, not preserved.** When the source rule's selector is a pseudo (`::before`, `::after`, `::marker`, etc.), do **not** leave it in the plugin file and do **not** count it as exempt. Instead, replace the pseudo-element in the consuming Handlebars template with a real DOM child (`<span>` / `<div>` / `<i>` with a descriptive `wh40k-…__<role>` class), then apply `tw-animate-<name>` to that new element. Add `tw-pointer-events-none` and `tw-absolute` (or whatever positioning the pseudo had) so the new element behaves like the old pseudo. Stacked pseudos (e.g. `::before` + `::after` on the same parent) become two sibling elements. The terminal state for every legacy animation rule is: invoked from a template via `tw-animate-*` on a real element.
- **Animation timing in `tailwind.config.js` must match the source.** The `theme.extend.animation` map defines the duration / timing-function / iteration / fill-mode for each utility. Entries use real values copied from the legacy plugin files (e.g., `'burst-pulse 0.6s ease'`, `'pulse-warn-intense 1.5s ease-in-out infinite'`, `'fade-spend 0.5s ease-out forwards'`), not placeholder `'1s ease'`. When the same keyframe name is invoked at multiple call sites with different timings, the config holds the most common tuple and outliers are expressed as arbitrary-value utilities on the consuming template (`tw-animate-[slide-in-up_0.4s_ease-out_backwards]`). A port that uses the wrong duration is a regression even when the ratchet count drops.

### Per-system theme tooling — the ultimate target

The 7 game systems (`bc`, `dh1`, `dh2`, `dw`, `ow`, `rt`, `im`, matching `src/module/config/game-systems/types.ts` `GameSystemId`) each get a Tailwind variant in `tailwind.config.js`. Use the variant in templates to gate utilities by system:

```hbs
<div class="tw-bg-gold dh2:tw-bg-bronze rt:tw-bg-amber-700">…</div>
```

Each variant maps to `[data-wh40k-system="<id>"] &`. The data attribute lives on the sheet root or any ancestor of the styled element — surface it from `_gameSystemId` on the sheet (`element.dataset.wh40kSystem = this._gameSystemId`) when wiring up the first system-aware template. **Visual divergence between systems is the long-term goal of the Tailwind migration; the animation and CSS-coverage ratchets are stepping stones.**

- `pnpm theme:coverage` — counts templates using at least one `<system>:tw-*` variant. Output at `.theme-coverage.json`, plus per-system hit counts.
- `pnpm theme:ratchet` — pre-commit gate; baseline at `.theme-baseline`. **Direction is opposite to other ratchets**: count of per-system-aware templates cannot FALL. Update via `pnpm theme:ratchet:update` after adding variants.
- Adoption recipe: pick a template, identify the elements that should differ visually per system, add `<system>:tw-*` variants alongside the base class, run `pnpm theme:ratchet:update`, commit.
- **Per-system color tokens live in the game-system configs**, not in templates. Each `src/module/config/game-systems/<id>-config.ts` declares a `theme: { primary, accent, border, … }` block whose values are named refs into the Tailwind palette (`'bronze'`, `'gold-raw'`, `'crimson'`, etc.) — not raw hex. The `themeClassFor(role)` helper exported from `src/module/config/game-systems/index.ts` reads the active system's `theme` and emits the matching utility class (e.g. `themeClassFor('border')` → `'tw-border-bronze'` for DH2e, `'tw-border-amber-700'` for RT). Templates call the helper rather than inlining `dh2:tw-border-bronze rt:tw-border-amber-700 …` chains, so palette changes happen in one place. New systems MUST declare a `theme` block; the type system enforces this via the `GameSystemConfig` shape in `types.ts`. Inlining a `<id>:tw-*` variant chain is acceptable only when the divergence is one-off and not reusable (e.g., a single decorative flourish on one template).
- **Helper-emitted classes must be safelisted; inline-variant classes don't need to be.** `themeClassFor(systemId, role)` produces bare class names (`tw-border-bronze`, `tw-bg-accent-dynasty`) at render time, which Tailwind's static template scan can't see — those classes go in `tailwind.config.js` `safelist`. By contrast, `<id>:tw-*` variant chains written inline on a template ARE visible to Tailwind's scan and emit correctly without safelisting. Choose the path per template: helper for surfaces where the system varies and you don't want every variant chain; inline variants for one-shot dressings where the chain is short and stays put.
- **Chat templates are NOT inside a sheet root.** Templates rendered into the Foundry chat log (`src/templates/chat/**/*.hbs`) have no `data-wh40k-system` ancestor — `<id>:tw-*` variants on them won't fire at runtime unless the chat card itself carries the attribute. The pattern is: accept an optional `gameSystem` hash param on the partial, and emit `data-wh40k-system="{{gameSystem}}"` on the card root when present. Call sites pass `gameSystem: actor.system.gameSystem` (or the active system's id) when rendering the chat message. The variants then cascade onto the card's children.

### Adaptation procedure when the canonical recipe doesn't apply

These rules are a starting point, not a contract. When you encounter a case the recipe doesn't cleanly cover, follow this loop:

1. **Run the metric first.** If you're touching a ratchet-tracked surface, capture the current count before the change (`pnpm <metric>:coverage`). If the count doesn't move after your change, you mis-targeted.
2. **Check the static-scan implication.** Tailwind only sees class names that appear literally in the content globs (`./src/templates/**/*.hbs`, `./src/module/**/*.{ts,js}`). If your change emits class names through TS string concatenation, a Handlebars helper, or `data-*` attributes, you must safelist them. Verify after the build by inspecting the generated CSS for the exact selector.
3. **Check the ancestor implication for variants.** Per-system Tailwind variants (`<id>:tw-*`) only fire when an ancestor in the rendered DOM carries `data-wh40k-system="<id>"`. If the template renders outside the sheet root (chat, popout windows, prompts opened against the canvas), you must either surface the attribute on the rendered root yourself or accept that variants won't activate there.
3a. **Check the `.wh40k-rpg` ancestor for ALL `tw-*` utilities.** `tailwind.config.js` sets `important: '.wh40k-rpg'`, which scopes EVERY generated utility to `.wh40k-rpg .{utility}`. Sheets carry the class via `DEFAULT_OPTIONS.classes`, so they're fine — but anything Foundry renders outside the sheet root loses ALL Tailwind, not just per-system variants. **Chat messages** (rendered into `<ol id="chat-log">` with no system ancestor) are the canonical regression: porting a chat template to inline Tailwind makes it appear as an unstyled white box until something gives the message DOM the class. The fix lives in the `renderChatMessageHTML` hook in `src/module/actions/basic-action-manager.ts` — it adds `wh40k-rpg` to the message element. Tooltip popouts, canvas-anchored prompts, and any other root rendered above `<body>` need the same treatment. When porting a template that renders outside a sheet, verify the rendered DOM has a `.wh40k-rpg` ancestor before considering the port complete.
4. **Prefer a smaller in-scope win over a bigger half-finished one.** If the planned port is large enough that you can't finish it in the current session without losing review quality (e.g., a pseudo-element refactor across a 400-line template plus a 270-line CSS region), pick the smallest isolated cluster inside the larger target, port that, advance the ratchet, and document what you skipped in the commit body so the next operator (Claude or grinder) picks up at the right place.
5. **Codify any pivot in this CLAUDE.md.** When you adapt — pick a different tool than the recipe specified, discover a constraint the recipe didn't mention, find a new place where a class name leaks past the static scan — write it back into the relevant tooling section so the next session doesn't rediscover it. Adapt-then-codify keeps the recipe living instead of stale.

### TS strictness tooling

- `pnpm ts:coverage` — counts `: any`, ` as any`, `@ts-expect-error`, `@ts-ignore` per top-level directory under `src/module/`. Output at `.ts-coverage.json`.
- The per-rule per-directory baseline catches the case where one directory cleans up while another regresses. The aggregate `tsc --noEmit` total is now a hard gate (must be zero) rather than a ratcheted baseline — see the pre-commit pipeline below.
- Foundry V14 type overrides live in `foundry-v14-overrides.d.ts` at the repo root. Both V14 gotchas (cleanData `_state` and registerSheet anonymous-class collisions) are encoded as patterns in the codebase — extend those patterns rather than introducing new wrappers.

### Casting policy

`Record<string, unknown>` is strictly weaker than the alternatives but strictly stronger than `any`. Property access stays `unknown` instead of vanishing into `any`, so downstream errors propagate instead of disappearing. Use it as a last resort, not a default.

**Where Record casts are acceptable** — true framework boundaries with no schema in this repo:
- `formData.object` (FormDataExtended payloads)
- arguments to `*.update(...)` / `*.create(...)` / `*.updateSource(...)`
- `CONFIG.<X>` accesses (Foundry's `CONFIG` is untyped; `Record<string, any>` is the documented exception)
- raw Foundry hook payloads
- third-party data with no shipped types

**Where Record casts are a regression** — anything DataModel-backed:
- Casting `this.system`, `actor.system`, `item.system` to `Record<...>` throws away the schema's typing. Fix the DataModel's `defineSchema()` or add `declare` fields on the class instead.
- Casting `talent`, `weapon`, `armour`, `actor`, `item` parameters whose concrete type the caller knows. Type the parameter properly.
- Same Record cast appearing 3+ times in one file. That's a missing interface — extract one and use it.

**Enforcement:**
- `@typescript-eslint/no-explicit-any` (warn) — flags new `any`.
- `no-restricted-syntax` rules in `.eslintrc.json` flag `as Record<string, unknown>` and `as Record<string, any>` casts as warnings. The `lint:ratchet` baseline ensures the count only goes down. Legitimate boundary casts contribute to the baseline; new internal cop-outs don't fit under it.
- The `as any` count is tracked per-directory by `ts:coverage` / `ts:ratchet`. `as Record<string, unknown>` rides on the lint baseline rather than `ts:coverage` because it's not strictly an `any`.

The auto-fix tooling (`.auto-fix/run.py`) prompt encodes the same policy — cheap-model grinders are instructed to look for upstream schema/interface fixes before reaching for a Record cast.

**Where boundary types belong**: extending Foundry's surface shapes is the job of `foundry-v14-overrides.d.ts`. When a Record cast is genuinely required at a Foundry boundary, the fix is to add the narrower shape to that overrides file as a `declare global` or `declare module 'fvtt-types/configuration'` augmentation — not to scatter `// eslint-disable` suppressions across every call site. Inline suppression is a last resort for shapes that don't yet exist in the overrides; the path to zero suppression is moving each unique boundary pattern into the overrides file once.

### No `eslint-disable` cop-outs

**File-level `/* eslint-disable <rule> */` blocks are forbidden anywhere in the codebase.** No exemptions, no "boundary file" rationale, no exception for storybook helpers or test harnesses. A file-level disable buries dozens of warnings in one stroke and disables enforcement on every future edit to that file. If a file would surface many warnings without the block, fix the warnings properly or drop the file from the current batch — never paper-over with a block disable.

**Inline `// eslint-disable-next-line` is only acceptable for these three categories. Anything else is a regression.**

1. **`noUncheckedIndexedAccess` parser mismatch** — when `tsconfig.test.json` (flag off) and `tsconfig.json` (flag on) both include the file, ESLint may report a `?.` / `!` / `if (x === undefined)` guard as `no-unnecessary-condition`, while `tsc` requires it. The disable comment must explicitly cite the parser mismatch.
2. **TRUE Foundry framework boundary** — methods/properties the framework itself types as untyped (`actor.update(payload)`, `ChatMessage.create(data)`, `renderTemplate(template, ctx)`, `fromUuid(uuid)` returning `unknown`, `ActiveEffect.getFlag(scope, key)` returning `unknown`, `foundry.utils.getProperty(obj, path)` returning `unknown`, `foundry.utils.deepClone(o)` taking/returning `unknown`, `DialogV2.prompt(...)` returning `unknown`, `CONFIG.<X>` access, FormDataExtended `.object`, raw hook payloads, `JSON.parse()` return). The comment must NAME the specific framework method/global being bounded; vague "boundary: opaque shape" is not enough.
3. **Mixin/super `as any` widening** — when a TS mixin constructor signature requires `any[]` (TS2545) because `unknown[]` is rejected, OR when calling `super.method as any` because the framework type-system genuinely admits no narrower type.

**Cop-outs that are NOT in the three allowed categories:**
- **Structural test mocks of our own types** (`WH40KBaseActor`, `OriginPathBuilder`, `BaseItemSheet`, `WH40KActorSystemData`) are NOT framework boundaries. Define a precise local interface that captures only the surface the test reaches into, OR narrow the function-under-test's parameter type so the mock satisfies it structurally.
- **`@typescript-eslint/require-await` suppressions** are cop-outs. Fix by replacing `async fn(...): Promise<X> { return x; }` with `fn(...): Promise<X> { return Promise.resolve(x); }`. No `async` keyword = no `require-await` violation.
- **"`globalThis` stubbing has no upstream schema"** is not a free boundary. Type the stub interface and use `vi.stubGlobal('game', stub satisfies GameStub)` or `Object.assign(globalThis, stub as TypedGlobalShape)` — the cast is at the stub-installation site only, and the surface is typed.
- **"Deep-merge walks `DeepPartial<T>` blobs"** — type the merge function with proper generics. `unknown` propagation through generic helpers is fixable via type narrowing at each call site.

**Enforcement applies retroactively when you touch a file.** Per Direction #5, any pre-existing file-level disable in a file you edit must be removed in the same change — not preserved. If removing the disable would surface warnings you cannot fix in scope, the file is not ready to be touched; either widen scope to address them or skip the edit.

**When briefing background agents for a lint sweep:** list the three allowed inline categories explicitly, list the cop-out anti-patterns above by name, and forbid file-level disables outright. After the agent runs, audit `git diff` for every new `eslint-disable` — strip every one that doesn't match the three categories.

### Null and undefined: choose the operator that matches the type

This codebase runs with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` strict. Both flags produce `T | undefined` (never `T | null`) for many constructs. Using the wrong null-check operator creates an unreachable branch that ESLint's `no-unnecessary-condition` correctly flags — and is then suppressed, masking what is really a wrong-operator mistake.

Match the operator to the actual type:

| Value's type | Correct check |
| --- | --- |
| `T \| undefined` (index access, optional params, `noUncheckedIndexedAccess` results, optional fields) | `x === undefined` (or `x !== undefined`) |
| `T \| null \| undefined` (DataModel optional schema fields with `nullable: true`, API responses, hand-typed unions) | `x == null` (loose, narrows both) |
| `T \| null` (rare; explicit nullable result) | `x === null` |

`eqeqeq` is configured `["warn", "always", { "null": "ignore" }]`, so `== null` is allowed for genuinely-nullable values; it is **not** a free pass to use loose equality everywhere. Using `x == null` on a `T | undefined` adds an unreachable `null` branch and earns an ESLint warning that must not be silenced with a suppression — change the operator instead.

### i18n typing

- `pnpm i18n:gen` — flatten `src/lang/en.json` into a string-literal union at `src/module/types/i18n-keys.d.ts`. The pre-commit hook regenerates automatically.
- `import { t } from '~/module/i18n/t'` — typed wrapper around `game.i18n.localize` / `game.i18n.format`. The type system rejects unknown keys and stale ones after a langpack rename. Use this for new code; existing `game.i18n.localize(...)` call sites can be migrated incrementally.

### Background ratcheting via cheap LLMs

The ratchets are designed so cheap, narrow-task LLM workers can grind them down without supervision. The default mechanism is the harness `ai` launcher pointed at a Gemini Flash slot:

```bash
ai gemini 1 --model gemini-3.1-flash-lite-preview -p '<task brief>'
```

- **Slot 0** uses the host's real `$HOME` (interactive auth via OAuth in `~/.gemini/`); only usable from a TTY where `$HOME` is unredirected.
- **Slot 1+** uses self-contained config under `.ai-sessions/gemini/<N>/` and works from any shell with no env override — this is the slot to use for spawned background tasks.
- Backends besides `gemini` (e.g. `codex`, `claude`, `local`) follow the same `<provider> <slot>` shape; pick whichever has a working session.

**Operator's notebook for prompting agents lives at `PROMPTING_AGENTS.md`** — invocation flags, model failure modes, brief template, worktree hygiene, partition shapes. Update it as new models are tried or new failure modes surface; do not duplicate that material here.

Background workers run in **isolated git worktrees** (one per task) so concurrent grinders don't collide on shared files. The orchestrator handles the merge — workers only modify files in their scope and write a `.migration-manifest.json` at the worktree root listing what they ported and what is now safe to delete. After all workers report, the orchestrator copies template changes to main and removes the relevant rules from `tailwind/*.js` plugin files (or deletes a fully-ported plugin file outright and removes its require from `tailwind.config.js`).

Tasks that suit cheap-model grinders (each map to a ratchet that gates regression):

| Task | Metric to drive |
| --- | --- |
| Port one `.hbs` template's classes to `tw-*` per `docs/tailwind-migration.md` | `pnpm css:coverage` (`css-only` ↓, `tailwind-only` ↑) |
| Move one `animation: <name>` declaration from a `tailwind/*.js` plugin file onto its consuming template as `tw-animate-<name>` | `pnpm animation:coverage` (count ↓) |
| Add per-system theme variants (`dh2:tw-bg-bronze rt:tw-bg-amber-700`) to one template's elements | `pnpm theme:coverage` (count ↑) |
| Replace one ` as any` cast in a sheet with a narrow type | `pnpm ts:coverage` (per-dir `asAny` ↓) |
| Add a `*.stories.ts` for one Sheet/Dialog using `pnpm scaffold:story` and `stories/test-helpers.ts` | `pnpm symmetry` (sheet missing-pair count ↓) |
| Add a `*.test.ts` for one DataModel using `pnpm scaffold:test` | `pnpm symmetry` (data missing-pair count ↓) |
| Migrate one `game.i18n.localize(...)` call site to `t(...)` | (no metric — but the typed key surface catches stale references on next run) |

Cheap workers can be wrong. The pre-commit ratchets and the typecheck/lint/vitest/storybook gates are what make this safe — a worker that breaks a sheet still has to pass `pnpm check`, and the orchestrator (in cheap-LLM grind mode) never `--no-verify` past failures.

### Parallel Claude-subagent refactor batches (deferred-verification mode)

A distinct mode from the cheap-LLM `ai` grinder above: the Claude Code orchestrator fans out several concurrent **`Agent` subagents** to execute a partitioned DRY/refactor workload (typically the actionable findings of a codebase audit). Use this when a large refactor cleanly partitions into disjoint file-scope chunks, or when several independent abstraction-adoption tasks can run at once. The recipe:

1. **Sync first.** Merge `origin/main` into the working branch before spawning anything, so every worktree branches from current HEAD.
2. **Partition into disjoint file sets.** Scope each subagent so no two touch the same file — partition by file type or directory (e.g. item-sheet `.hbs` vs item-sheet `.ts` vs `config/` vs an actor panel). This is what makes the worktree branches merge cleanly without conflicts.
3. **Single-owner shared files.** Any file multiple tasks might edit — the Handlebars preload list (`handlebars-manager.ts`), `tailwind.config.js`, a barrel `index.ts` — is assigned to **exactly one** subagent, and every other brief explicitly forbids touching it.
4. **Worktree isolation, background.** Launch each subagent with `isolation: "worktree"` and `run_in_background: true`. One worktree branch per task; the orchestrator owns the merge-back.
5. **The brief is a contract.** Each subagent prompt MUST: enumerate precise in-scope files and explicit out-of-scope files; require behavior-preserving edits that stay homologation-safe across all 7 systems; **forbid running any verification** (`pnpm check`/`test`/`typecheck`/`lint`/`build`/`storybook`, any `*:coverage`/`*:ratchet`, `preload:drift`, `i18n`) and the pre-commit hooks; require `git commit --no-verify`, **no push, no PR**; and require a closing report of files changed, net LOC delta (`git diff --stat`), commit hash, and worktree branch.
6. **Deferred batched verification — the point of this mode.** Per-agent verification burns context and wall-clock re-validating overlapping surfaces that one batched pass would cover anyway. So subagents skip it and the **orchestrator** merges all worktree branches into the working branch, resolves any conflict, then runs **one** full `pnpm check` + ratchet pass and fixes the fallout — once — before the final pre-PR commit (that last commit IS verified normally). The safety invariant from the cheap-LLM section still holds where it matters: **nothing reaches a PR or the remote default branch unverified**. Verification is deferred and batched in this mode, never skipped.

Keep granular brief templates, model flags, and partition-shape recipes in `PROMPTING_AGENTS.md`; this section is the doctrine, not the notebook.

### `.auto-fix/` — TSC and ESLint grinder

`.auto-fix/run.py` walks per-file TSC error or ESLint warning manifests and feeds each file through a provider ladder (local vLLM Qwen3-Coder → gemini flash-lite → gemini flash → codex 2). Each accepted edit is ratchet-gated and gemini-flash sanity-checked before commit.

```bash
./.auto-fix/run.py                      # tsc mode, tiers 1+2 from existing manifest
./.auto-fix/run.py --mode lint --scrape # rescrape eslint warnings, then fix tiers 1+2
./.auto-fix/run.py --mode lint --scrape --dry  # only rebuild lint manifest
./.auto-fix/run.py --mode tsc 1         # tsc mode, tier 1 only
./.auto-fix/run.py --gemini             # skip local vLLM, start ladder at flash-lite
./.auto-fix/run.py --no-sanity          # skip the gemini-flash YES/NO sanity check
```

Manifests and progress files are mode-suffixed:

| Mode | Manifest | Progress |
| --- | --- | --- |
| tsc  | `.auto-fix/tsc-error-manifest.json` | `.auto-fix/progress.json` |
| lint | `.auto-fix/eslint-warning-manifest.json` | `.auto-fix/progress-lint.json` |

Each file in a manifest is classified into tier 1/2/3 by the difficulty distribution of its TS codes (`EASY_CODES` / `MEDIUM_CODES` / `HARD_CODES` in `run.py`) or ESLint rules (`EASY_RULES` / `MEDIUM_RULES` / `HARD_RULES`) and the file size cap (`MAX_FILE_LINES = 800`). Tier 1 = ≥80% easy items; tier 2 = ≥60% easy+medium; tier 3 = anything else. Per-code/per-rule prompt guidance lives in `ERROR_GUIDANCE` and `LINT_GUIDANCE` and is included in the prompt only for codes/rules actually present in the file.

**Ratchet semantics per accepted edit:**

- tsc mode: TSC total must DROP, ESLint must NOT RISE, no new TS codes introduced in the file.
- lint mode: ESLint total must DROP, TSC must NOT RISE, no new ESLint rules introduced in the file.

**Sanity check before commit:** after the ratchet passes, the diff is shown to gemini flash with the prompt *"Does this diff only change typing and/or fix lint warnings and not change functionality or cause errors? Respond YES or NO."* A NO verdict rolls the file back and escalates the ladder (same as a regress). An unparseable verdict logs a `*-sanity-unknown.log` and proceeds. Disable with `--no-sanity` for debugging only.

**Provider ladder gates:**

- Local vLLM is tried first unless `--gemini` is passed or vLLM is unreachable (in which case it is disabled for the rest of the run).
- Gemini flash-lite is the first cloud step. It cycles slot 0 ↔ slot 1 with exponential backoff on usage limits.
- Gemini flash unlocks only after a flash-lite attempt produces an *applied-but-rejected* edit on the same file (regression OR sanity NO). This avoids burning flash quota on files where no model can make progress.
- Codex 2 unlocks after `FLASH_FAILURES_BEFORE_CODEX = 2` flash failures.

Per-file logs land in `.auto-fix/file-logs/<sanitized-path>.attempt<N>.<runner>-<outcome>.log` and contain the prompt, raw output, applied diff, ratchet reason, and sanity verdict.

### Pre-commit pipeline (in order)

1. `lint-staged` — eslint --fix, biome --fix, and prettier on staged files.
2. `biome:ratchet` — Biome diagnostics (errors + warnings) cannot rise.
3. `i18n:gen` — regenerate `i18n-keys.d.ts` from the langpack.
4. `icons:gen` — regenerate the icon registry and typed key union.
5. `typecheck` — `tsc --noEmit` against the main tsconfig must pass with zero errors (hard gate).
6. `lint:ratchet` — ESLint warning count over `src/module/ src/templates/ stories/ tests/` (app + story + test code, one strong config) cannot rise; errors are never allowed.
7. `css:ratchet` — `tailwind-only` cannot fall, `css-only` cannot rise.
8. `important:ratchet` — count of `!important` declarations across `tailwind/*.js` cannot rise.
9. `css:plugin-audit` — every `tailwind/*.js` rule must reference at least one `wh40k-*` class that appears in templates/modules/tests/stories (walks nested selectors). Hard gate.
10. `animation:ratchet` — count of `animation:` / `animation-name:` declarations across `src/css/**/*.css` cannot rise.
11. `theme:ratchet` — count of templates using per-system `<system>:tw-*` variants cannot fall (adoption ratchet — opposite direction; rises as templates gain per-system theming).
12. `ts:ratchet` — per-rule per-directory suppression counts cannot rise; auto-flips to strict at 0.
13. `strict:ratchet` — `tsc --noEmit -p tsconfig.strict.json` per-TS-code counts cannot rise; auto-flips to strict at 0. Enforces the next-tier strictness flags.
14. `test:typecheck:ratchet` — `tsc --noEmit -p tsconfig.test.json` per-TS-code counts cannot rise; auto-flips to strict at 0. Brings tests + stories into the typecheck surface.
15. `type-coverage:ratchet` — inferred type-coverage `covered` count cannot fall; auto-flips to strict at 100%.
16. `knip:ratchet` — per-category unused-detection counts (files, exports, types, deps, …) cannot rise; auto-flips per category at 0.
17. `deps:ratchet` — dependency-cruiser per-rule violation counts cannot rise; auto-flips per rule at 0. Enforces the 3-layer architecture + correctness rules.
18. `lockfile:validate` — every resolution URL in `pnpm-lock.yaml` must point at an allow-listed host (hard gate).
19. `symmetry:ratchet` — missing-story / missing-test counts cannot rise.
20. `preload:drift` — every `{{> ... }}` partial reference must be preloaded; preload entries cannot point at non-existent files.
21. Pack validation if `gulpfile.js` or `src/packs/` changed.
22. `vitest run` — full Vitest suite must pass.
23. Storybook Playwright integration tests.

Hooks run for 30–60s on large commits. Wait for them; do not interrupt or `--no-verify` past failures. If a hook fails, investigate and fix; do not silence.

---

## Architecture

### 3-layer pattern (logic in DataModels, not sheets)

| Layer         | Purpose                       | Example                              |
| ------------- | ----------------------------- | ------------------------------------ |
| **DataModel** | Schema, calculations          | `src/module/data/item/weapon.ts`     |
| **Document**  | Roll methods, public API      | `src/module/documents/item.ts`       |
| **Sheet**     | UI, events, rendering only    | `src/module/applications/item/...`   |

Sheets are UI shells. They must not contain business logic — that belongs in the DataModel. Documents expose the API surface (`actor.rollCharacteristic(...)`, `actor.rollSkill(...)`, `actor.rollItem(itemId)`).

### Data prep flow

```
Actor.prepareData()
  → DataModel.prepareBaseData()         // Base values
  → DataModel.prepareDerivedData()      // Computed properties
  → Document.prepareEmbeddedDocuments() // Items loaded
  → Document.prepareEmbeddedData()      // Apply item modifiers
```

### Sheet structural pattern (ApplicationV2)

```ts
export default class MySheet extends BaseItemSheet {
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'my-type'],
        position: { width: 600, height: 700 },
        actions: { myAction: MySheet.#myAction }, // Static methods
    };
    static PARTS = {
        sheet: { template: '...', scrollable: ['.wh40k-tab-content'] },
    };
    static TABS = [{ tab: 'details', group: 'primary', label: 'Details' }];
    tabGroups = { primary: 'details' }; // Default tab
}
```

**Edit mode is inherited from `BaseItemSheet`** — never reimplement it. Properties available: `canEdit`, `inEditMode`, `isCompendiumItem`, `isOwnedByActor`.

### Skills

- Standard skills: single value on the actor schema
- Specialist skills: array of entries, each with its own `specialization`, `advance`, computed rank/`trained`/`plus10`/`plus20`/`plus30` flags

See `src/module/data/actor/templates/creature.ts`.

---

## Critical gotchas

1. **Template context: use `{{system.xxx}}`, NOT `{{actor.system.xxx}}`.**
   ```handlebars
   {{! CORRECT }}
   <input name="system.wounds.value" value="{{system.wounds.value}}" />
   {{! WRONG }}
   <input name="actor.system.wounds.value" value="{{actor.system.wounds.value}}" />
   ```
2. **Use `data-action="name"`, not jQuery event binding.** Actions resolve to static class methods declared in `DEFAULT_OPTIONS.actions`.
3. **Input `name` must match the DataModel schema exactly.** Foundry's form parser uses the name path to write back into the document.
4. **Integer fields under V14 strict validation:** coerce via `migrateData()` when accepting legacy data.
5. **ProseMirror editors:** wrap with `{{#if inEditMode}}` for compendium safety — they crash in read-only contexts.
6. **TABS array uses `tab:`, not `id:`.** V2 classes must include `"sheet"` in the classes array.
7. **Never write a custom tab handler** — use `PrimarySheetMixin` (`src/module/applications/api/primary-sheet-mixin.ts`) and let the base class manage tab state.
8. **Class names** use `.wh40k-{component-abbreviation}-{element}--{modifier}` — generic `.wh40k-` classes collide across unrelated components, so include the component abbreviation (e.g., `.wh40k-hdr-name`, not `.wh40k-name`).
9. **Foundry V14 `SystemDataModel.cleanData`** must pass `_state` to `super` or partial cleaning breaks. See migration history before touching `cleanData` overrides.
10. **Foundry V14 `registerSheet`** receives factory-returned anonymous classes that all get `name=""` and collide. Use `Object.defineProperty` to set the class name explicitly.
11. **Compendium references are UUID-primary.** Talent / trait / skill grants, prerequisites, originPath steps, and description-text references store the Foundry UUID (`Compendium.wh40k-rpg.<pack>.<type>.<id>`); display names are computed at render time. Three resolution paths, in order of preference:
    - **Structured fields** (DataModel slots): store the UUID, read the display name with `uuidNameCache.getName(uuid)` from `src/module/utils/uuid-name-cache.ts`, or `{{uuid-name uuid}}` in Handlebars. Each name-based reference field has a parallel `…Uuid` slot during the migration window — populate the UUID slot and let the legacy name field become read-only display.
    - **Inline freeform text**: embed `{{Compendium.wh40k-rpg.<pack>.<type>.<id>}}` tokens; expand via `uuidNameCache.expandTemplates(text)` or the `{{uuid-expand text}}` Handlebars helper.
    - **Rich-text / description HTML**: use Foundry's native `@UUID[Compendium.wh40k-rpg.<pack>.<type>.<id>]` syntax. The custom `@Quality[…]` / `@Property[…]` / `@Condition[…]` enrichers were removed in favor of native `@UUID[…]`.
    Tooling: `pnpm packs:audit` rebuilds `.compendium-uuid-index.json`; `scripts/migrate-refs-to-uuid.mjs` resolves legacy name refs in compendium JSON. Per-system scoping is mandatory — `Dodge` exists in six systems with different UUIDs; lookups must scope by the actor / item's owning game system (pack prefix `dh1` / `dh2` / `bc` / `dw` / `ow` / `rt`). Content *mechanics* follow the same rule (Direction #7): deltas, clamps, thresholds, and labels for content-driven effects (e.g. Subtlety adjusters) are authored as structured fields on the compendium document and discovered at runtime by walking the actor's owned items / origin path — never as an in-`src/` registry or a name string-match. The boot-time resync deep-clones the whole compendium `system` onto owned items, so a new structured field propagates automatically as long as it is not added to `RUNTIME_PRESERVE_PATHS`.

---

## Build, test, dev

```bash
pnpm build                            # Gulp build → dist/
pnpm watch                            # Continuous build
pnpm test                             # Vitest run
pnpm test:watch                       # Vitest watch
pnpm test:coverage                    # Vitest with v8 coverage
pnpm storybook                        # Storybook dev server (port 6006)
pnpm build-storybook                  # Static Storybook build
pnpm typecheck                        # tsc --noEmit
pnpm lint                             # eslint src/module/
pnpm check                            # Aggregate: lint + format + stylelint + typecheck + test

# Coverage scripts (read-only, write JSON reports)
pnpm css:coverage                     # template tailwind/mixed/css-only classification
pnpm ts:coverage                      # per-rule, per-directory TS suppression counts
pnpm strict:coverage                  # per-TS-code count under tsconfig.strict.json
pnpm test:typecheck:coverage          # per-TS-code count under tsconfig.test.json
pnpm type-coverage                    # inferred type-coverage % under --strict
pnpm knip                             # unused files/exports/types/deps
pnpm deps:check                       # dependency-cruiser architectural rules
pnpm symmetry                         # sheets without stories, data/documents without tests
pnpm preload:drift                    # Handlebars partial references vs preload list
pnpm lockfile:validate                # pnpm-lock.yaml resolution-host allow-list

# Ratchet baselines (run after a metric drops, in the same commit)
pnpm css:ratchet:update
pnpm ts:ratchet:update
pnpm strict:ratchet:update
pnpm test:typecheck:ratchet:update
pnpm type-coverage:ratchet:update
pnpm knip:ratchet:update
pnpm deps:ratchet:update
pnpm symmetry:ratchet:update
pnpm lint:ratchet:update
pnpm biome:ratchet:update

# Codegen and scaffolds
pnpm i18n:gen                         # rebuild i18n-keys.d.ts from en.json
pnpm scaffold:story <source.ts>       # write a co-located *.stories.ts skeleton
pnpm scaffold:test <source.ts>        # write a co-located *.test.ts skeleton

FOUNDRY_PASS=... ./pull-foundry.sh    # Mirror Foundry runtime + installed modules → .foundry-release/
```

**First-time Storybook setup:** run `pull-foundry.sh` once to populate `.foundry-release/` with Foundry's compiled stylesheet (`foundry2.css`), fonts, and other public assets. Storybook serves them as static files and loads `foundry2.css` via `<link>` (it cannot go through Vite's PostCSS pipeline because Tailwind misinterprets Foundry's native `@layer` cascade directives). Without this, stories render against browser defaults instead of Foundry's chrome / theme. Re-run `pull-foundry.sh` after Foundry server upgrades.

Deploy is via `deploy.sh` in the parent vault directory — **never run it without explicit user instruction**.

---

## Hard rules (operational)

- **Never deploy without explicit user instruction.** This includes `deploy.sh`, manual file copies into the Foundry data dir, or pushing tagged releases.
- **Never use `sed` or `awk` to edit files.** Always use the Edit tool for reviewability.
- **Never hardcode content-specific values or strings in `src/`** (Direction #7). Item / skill / talent / trait / weapon / origin / condition mechanics and their display labels come from compendium `_source/*.json` via the shared item templates and `uuidNameCache`, discovered by tree-walking the actor. The only exceptions are content-agnostic primitives (`manual`, `inquest`, pure clamp math), which must be namespaced outside the content i18n tree (`WH40K.Subtlety.ManualAdjustment`, not `WH40K.Subtlety.Source.*`).
- **Never `rm -rf` inside `node_modules/`** to "fix" install errors. Just run `pnpm install`.
- **Wait for lint-staged hooks on commit** (30–60s on large commits). Don't retry or interrupt.
- **Read Foundry source before guessing at fixes.** No rapid-fire deploy-and-pray cycles.
- **Batch builds at the end** of a multi-edit task — make all changes first, then build once.

---

## Project quick reference

| Key       | Value                                          |
| --------- | ---------------------------------------------- |
| System ID | `wh40k-rpg`                                    |
| Foundry   | V14                                            |
| Language  | TypeScript (`.ts`)                             |
| Build     | Gulp + PostCSS + Tailwind                      |
| Tests     | Vitest + happy-dom                             |
| Stories   | Storybook 10 (HTML + Vite)                     |
| Style     | DataModel-heavy, slim Documents, ApplicationV2 |
