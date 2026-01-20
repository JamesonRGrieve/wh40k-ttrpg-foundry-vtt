# Rogue Trader VTT Code Style

## Naming Conventions
- Files: kebab-case with `.mjs` extension; version suffixes like `-v2` for modernized implementations (e.g., `src/module/data/actor/npc-v2.mjs`).
- Classes: PascalCase, often with `V2` suffix or `RogueTrader` prefix (e.g., `NPCDataV2`, `RogueTraderAcolyte`).
- Functions/methods: camelCase; internal helpers often use a leading underscore (e.g., `_prepareCharacteristics`).
- Constants: UPPER_SNAKE_CASE (e.g., `SYSTEM_ID` in `src/module/constants.mjs`).

## File Organization
- Data models in `src/module/data/` with actor/item separation and shared templates/fields.
- Documents in `src/module/documents/` provide runtime API/roll helpers and lifecycle hooks.
- UI sheets in `src/module/applications/` with mixins in `src/module/applications/api/`.
- Handlebars helpers in `src/module/handlebars/` and utilities in `src/module/utils/`.
- Compendium JSON sources live under `src/packs/**/_source/`.

## Import Style
- ES module imports with explicit file extensions (`.mjs`).
- Relative imports are preferred inside `src/module/` (e.g., `import ... from './hooks-manager.mjs';`).
- Barrel exports used for documents and applications (`src/module/documents/_module.mjs`, `src/module/applications/_module.mjs`).

## Code Patterns
- DataModel schema + derived data
  - `static defineSchema()` defines fields and uses Foundry field types.
  - `prepareDerivedData()` computes totals and derived values.
  - `prepareEmbeddedData()` applies item-derived modifiers (see `src/module/data/actor/character.mjs`).
- Mixin-based composition
  - DataModel mixins via `SystemDataModel.mixin(...)` (`src/module/data/abstract/system-data-model.mjs`).
  - ApplicationV2 sheets built from a mixin stack (`src/module/applications/actor/base-actor-sheet.mjs`).
- Action handlers
  - UI actions declared in `static DEFAULT_OPTIONS.actions` and triggered via `data-action` attributes in templates.
- Rolls
  - Use `D100Roll` for characteristic/skill tests (e.g., `src/module/documents/acolyte.mjs`).

## Error Handling
- Early returns for invalid state (e.g., missing items/actors).
- UI feedback via Foundry toasts (`foundry.applications.api.Toast.warning`).
- Console warnings for migration/validation issues in scripts.

## Logging
- System logging uses `game.rt.log`/`game.rt.error` when available (configured in `src/module/hooks-manager.mjs`).
- Scripts/log utilities rely on `console.log` for batch output.

## Testing
- No unit test framework detected.
- Scripted validation in `scripts/test-weapon-migration.mjs` for migration checks.
- Some compendium entries include `test` in their filenames under `src/packs/**/_source/`.

## Linting & Formatting
- ESLint config: `.eslintrc.json` (extends `@typhonjs-fvtt/eslint-config-foundry.js`).
- Prettier config: `.prettierrc` with `tabWidth: 4`, `singleQuote: true`, `semi: true`, `printWidth: 160`.
- Handlebars formatting override: `.prettierrc` sets `singleQuote: false` for `**/*.hbs`.

## Do's and Don'ts
- Do use `{{system.xxx}}` in Handlebars templates, not `{{actor.system.xxx}}` (project convention).
- Do use `data-action="..."` handlers wired through `DEFAULT_OPTIONS.actions` in ApplicationV2 sheets.
- Do use the `npcV2` actor type for modern NPCs; legacy `npc` is deprecated.
- Don't bind events with jQuery; ApplicationV2 actions are preferred.
- Don't use `ui.notifications`; use the Foundry V13 toast API instead.
