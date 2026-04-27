# Claude Code Instructions — wh40k-rpg

This is the **Warhammer 40K RPG** Foundry VTT system. It implements seven d100-family 40K tabletop RPGs — six FFG-era lines (Black Crusade [BC], Dark Heresy 1e [DH1], Dark Heresy 2e [DH2], Deathwatch [DW], Only War [OW], Rogue Trader [RT]) plus Cubicle 7's Imperium Maledictum (IM) — on Foundry **V14**, in TypeScript.

DH2 is the canonical default of the FFG family (the bare `header-dh.hbs`); DH1 is a separate variant (`header-dh1.hbs`). IM shares the d100 roll-under engine but layers Patrons, Factions, Endeavours, and WFRP-style critical hits over it; its divergences are opt-in via `*-im.hbs` templates and `im-*` DataModels. Actor types follow `<system>-<role>` (e.g., `dh2-character`, `dh1-npc`, `im-character`, `rt-starship`).

---

## Direction (every change must advance these)

These are not optional polish items. Every PR, refactor, and new component must move the codebase in these directions, or it does not land. A change that is neutral on all four is suspicious — ask whether it's worth doing.

1. **Full strong TypeScript coverage.** No new `any`. No new `@ts-ignore` / `@ts-expect-error` (existing suppressions may stay until the underlying issue is fixed, but every PR should reduce, not grow, that count). Migrate any `.js` / `.mjs` you touch to `.ts`. New code is fully typed at signatures and return values; prefer narrow types over `unknown`.

2. **Full migration from CSS/SCSS to Tailwind.** New styling uses `tw-` utility classes inline on templates and PARTS classes — no new rules in `src/css/`, no new SCSS files. When you edit a `.hbs` template, opportunistically port its existing CSS rules to inline Tailwind and remove the now-unused selectors. The CSS pipeline is being phased out.

3. **Full homologated support of all 7 game systems.** BC, DH1, DH2, DW, OW, RT, IM all share data structure, behavior, and visual treatment. Per-system divergence is opt-in via explicit per-system templates (e.g., `header-bc.hbs`, `header-rt.hbs`, `header-im.hbs`) or explicit branching — never accidental. A change that improves one system must improve, or at minimum not regress, the other six. When you add a feature, verify it works across all seven before considering the work done. IM-specific surfaces (Patrons, Factions, Endeavours, critical-hit tables) are scoped extensions, not exceptions to homologation — the underlying actor / item / roll plumbing stays shared.

4. **Full DRY.** No copy-paste between sheets, mixins, templates, helpers, or DataModels. Extract partials, mixins, and utility functions. If you write similar logic twice, the third time you extract — and prefer extracting on the second instance when the abstraction is obvious.

5. **All player-facing strings live in the langpack.** Any string a user can read in the UI — labels, tab names, button text, tooltips, placeholders, dialog titles, validation/error messages, chat card text, notifications — must be a localization key resolved through `src/lang/en.json` and namespaced under `WH40K.*`. Use `{{localize "WH40K.…"}}` (or `{{#localize}}…{{/localize}}` for inline blocks) in Handlebars and `game.i18n.localize(...)` / `game.i18n.format(...)` in TypeScript. Hard-coded English in templates, sheet `DEFAULT_OPTIONS.window.title`, `static TABS[].label`, action method strings, or `ui.notifications.*` calls is a regression and must be ported the moment you touch the surrounding code. Add new keys to `en.json` in the same PR; never reference a key that doesn't exist. Internal identifiers (CSS classes, action names, schema field paths, data-* attributes, log messages, dev-only console output) are not player-facing and stay as plain strings.

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

---

## Coverage metrics & ratchets

Every direction in the previous section is backed by a coverage script and a ratchet. The ratchets enforce a one-way valve: any PR may improve a metric, no PR may regress one. When a metric drops, run the matching `*:ratchet:update` to lower the baseline in the same commit. The pre-commit hook runs all ratchets in sequence; bypassing with `--no-verify` requires explicit user authorization.

### Ratchet inventory

| Direction | Coverage script | Ratchet | Baseline file |
| --- | --- | --- | --- |
| Tailwind migration | `pnpm css:coverage` | `pnpm css:ratchet` | `.css-coverage-baseline` |
| Strong TS (per-rule, per-dir) | `pnpm ts:coverage` | `pnpm ts:ratchet` | `.ts-coverage-baseline` |
| `tsc --noEmit` total errors | (built into ratchet) | `pnpm typecheck:ratchet` | `.tsc-error-baseline` |
| ESLint warnings | (built into ratchet) | `pnpm lint:ratchet` | `.eslint-warning-baseline` |
| Sheet → story / data → test pairing | `pnpm symmetry` | `pnpm symmetry:ratchet` | `.symmetry-baseline` |
| Preload-list integrity (Handlebars partials) | `pnpm preload:drift` | hard gate (no ratchet) | — |
| i18n key codegen freshness | `pnpm i18n:check` | hard gate (auto-regen pre-commit) | — |

The hard gates (preload-drift, i18n) cannot be ratcheted because regression is a real bug, not a velocity tradeoff. Fix the underlying issue.

### CSS migration tooling

The CSS pipeline is an in-progress migration from a single concatenated monolith (`src/css/wh40k-rpg.css`) toward inline Tailwind utilities. The monolith preserves original component boundaries via `/* ── source: <path> ── */` markers.

- `pnpm css:coverage` — classifies every `.hbs` template as `tailwind-only`, `mixed`, or `css-only`. Output at `.css-coverage.json`.
- `pnpm css:block-index` — parses the monolith markers into `.css-blocks.json` (which source path occupies which line range). Refreshed automatically pre-commit.
- `pnpm css:block list` — list every source path still present in the monolith.
- `pnpm css:block show <source>` — print the rule block for a source path.
- `pnpm css:block delete <source>` — remove every range for a source path. Run only after every consumer template has been ported (verified by grepping the relevant classes).
- The CSS variable → Tailwind utility translation map is `scripts/css-token-map.json`. Extend this file when a new variable becomes worth a token rather than re-deriving on every port.
- The full migration recipe lives in `docs/tailwind-migration.md` — read it before porting templates.

Never add new rule blocks to `src/css/wh40k-rpg.css` outside the trailing `@tailwind` directives. The CSS pipeline is being phased out; new styling is `tw-*` utilities inline on templates.

### TS strictness tooling

- `pnpm ts:coverage` — counts `: any`, ` as any`, `@ts-expect-error`, `@ts-ignore` per top-level directory under `src/module/`. Output at `.ts-coverage.json`.
- The per-rule per-directory baseline catches the case where one directory cleans up while another regresses. The aggregate `tsc --noEmit` ratchet (`.tsc-error-baseline`) is independent and gates total errors.
- Foundry V14 type overrides live in `foundry-v14-overrides.d.ts` at the repo root. Both V14 gotchas (cleanData `_state` and registerSheet anonymous-class collisions) are encoded as patterns in the codebase — extend those patterns rather than introducing new wrappers.

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

Background workers run in **isolated git worktrees** (one per task) so concurrent grinders don't collide on shared files like `src/css/wh40k-rpg.css`. The orchestrator handles the merge — workers only modify files in their scope, never delete from the monolith, and write a `.migration-manifest.json` at the worktree root listing what they ported and what is now safe to delete. After all workers report, the orchestrator copies template changes to main and runs `pnpm css:block delete <source>` for each safe-to-delete entry.

Tasks that suit cheap-model grinders (each map to a ratchet that gates regression):

| Task | Metric to drive |
| --- | --- |
| Port one `.hbs` template's classes to `tw-*` per `docs/tailwind-migration.md` | `pnpm css:coverage` (`css-only` ↓, `tailwind-only` ↑) |
| Replace one ` as any` cast in a sheet with a narrow type | `pnpm ts:coverage` (per-dir `asAny` ↓) |
| Add a `*.stories.ts` for one Sheet/Dialog using `pnpm scaffold:story` and `stories/test-helpers.ts` | `pnpm symmetry` (sheet missing-pair count ↓) |
| Add a `*.test.ts` for one DataModel using `pnpm scaffold:test` | `pnpm symmetry` (data missing-pair count ↓) |
| Migrate one `game.i18n.localize(...)` call site to `t(...)` | (no metric — but the typed key surface catches stale references on next run) |

Cheap workers can be wrong. The pre-commit ratchets and the typecheck/lint/vitest/storybook gates are what make this safe — a worker that breaks a sheet still has to pass `pnpm check`, and the orchestrator never `--no-verify` past failures.

### Pre-commit pipeline (in order)

1. `lint-staged` — eslint --fix and prettier on staged files.
2. `i18n:gen` — regenerate `i18n-keys.d.ts` from the langpack.
3. `css:block-index` — refresh `.css-blocks.json` from the monolith.
4. `typecheck:ratchet` — `tsc --noEmit` total error count cannot rise.
5. `lint:ratchet` — ESLint warning count cannot rise; errors are never allowed.
6. `css:ratchet` — `tailwind-only` cannot fall, `css-only` cannot rise.
7. `ts:ratchet` — per-rule per-directory suppression counts cannot rise.
8. `symmetry:ratchet` — missing-story / missing-test counts cannot rise.
9. `preload:drift` — every `{{> ... }}` partial reference must be preloaded; preload entries cannot point at non-existent files.
10. Pack validation if `gulpfile.js` or `src/packs/` changed.
11. `vitest run` — full Vitest suite must pass.
12. Storybook Playwright integration tests.

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
pnpm symmetry                         # sheets without stories, data/documents without tests
pnpm preload:drift                    # Handlebars partial references vs preload list

# CSS monolith surgery
pnpm css:block-index                  # refresh .css-blocks.json from markers
pnpm css:block list                   # list every source path in the monolith
pnpm css:block show <src>             # print the rule block
pnpm css:block delete <src>           # remove every range for <src>

# Ratchet baselines (run after a metric drops, in the same commit)
pnpm css:ratchet:update
pnpm ts:ratchet:update
pnpm symmetry:ratchet:update
pnpm typecheck:ratchet:update
pnpm lint:ratchet:update

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
