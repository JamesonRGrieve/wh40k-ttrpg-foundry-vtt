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

- **Vitest covers all functionality.** Pure logic (calculators, processors, validators), DataModel methods, Document methods, helpers, and mixin behaviors all get unit tests. `pnpm test` must pass before commit. Tests live in `tests/` (separate from `src/` so the build never ships them) or co-located as `*.test.ts`.
- **Storybook stories for every component.** Sheets, dialogs, partials, chat cards, HUD widgets, prompts — each gets a `*.stories.ts`. Stories use the factories in `stories/mocks/` to produce realistic mock data; do not hand-author 200-field mock objects per story.
- **Interactive unit testing in stories.** Stories with behavior use Storybook's `play` function (or Vitest + happy-dom against the rendered output) to assert on clicks, form submission, action dispatch, and drag/drop where applicable. A "renders without throwing" story is not enough for a component with interactivity.
- **CSS composition testing.** Full-sheet stories render multiple partials together (header + tabs + panels) so layout regressions, theme cascade breaks, and Tailwind class conflicts show up in visual review. Single-partial stories alone do not satisfy this.
- **Live partials must be preloaded.** If a sheet or dialog references a new Handlebars partial at runtime, also add it to `HandlebarManager.preloadHandlebarsTemplates()` in `src/module/handlebars/handlebars-manager.ts`. Storybook's glob-based partial registration can hide this mistake; Foundry runtime will not.

When you add a component, the story and tests are part of the same PR. When you fix a component, also add the story/tests if they don't exist — leave the area better covered than you found it.

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
