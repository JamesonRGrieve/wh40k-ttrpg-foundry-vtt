# Rogue Trader VTT Architecture

## Overview
- Foundry VTT V13 system for Rogue Trader (Dark Heresy 2e-derived) with a DataModel-heavy architecture and ApplicationV2 UI stack.
- Entry module registers hooks, Handlebars helpers, and custom text enrichers for the system runtime.

## Tech Stack
- Language: JavaScript ES modules (`.mjs`) with Foundry V13 APIs.
- UI: Handlebars templates + ApplicationV2 sheets with mixin stack.
- Styling: SCSS compiled via Gulp (`src/scss/**/*.scss`).
- Build tooling: Gulp tasks for build, packs, and SCSS (`gulpfile.js`).
- Data packs: Foundry V13 LevelDB compendia built from JSON sources in `src/packs`.
- Key libs: `classic-level`, `gulp`, `sass`, `@typhonjs-fvtt/eslint-config-foundry.js`.

## Directory Structure
- `src/module/` - Core system code (entry, hooks, documents, data models, apps, utils).
- `src/templates/` - Handlebars templates for sheets, parts, and dialogs.
- `src/scss/` - SCSS theme and components (compiled to CSS).
- `src/packs/` - Compendium pack sources (`_source` JSON) for items, actors, journals.
- `scripts/` - One-off tooling and migration scripts.
- `dist/` - Build output (per project docs).

## Core Components
- Entry & hooks
  - Entry module: `src/module/rogue-trader.mjs`.
  - Hook wiring + system registration: `src/module/hooks-manager.mjs`.
  - Handlebars helpers: `src/module/handlebars/handlebars-manager.mjs`.
  - Text enrichers: `src/module/enrichers.mjs`.
- Data models (system data layer)
  - Base types: `src/module/data/abstract/system-data-model.mjs`, `src/module/data/abstract/actor-data-model.mjs`, `src/module/data/abstract/item-data-model.mjs`.
  - Actor models: `src/module/data/actor/character.mjs`, `src/module/data/actor/npc-v2.mjs`, `src/module/data/actor/vehicle.mjs`, `src/module/data/actor/starship.mjs`.
  - Item models: `src/module/data/item/*.mjs` (talent, origin-path, weapons, etc.).
  - Custom fields/templates: `src/module/data/fields/*.mjs`, `src/module/data/shared/*.mjs`.
- Documents (runtime API surface)
  - Actor documents: `src/module/documents/base-actor.mjs`, `src/module/documents/acolyte.mjs`, `src/module/documents/npc-v2.mjs`.
  - Item document: `src/module/documents/item.mjs`.
  - Export barrel: `src/module/documents/_module.mjs`.
- UI layer
  - Base sheet: `src/module/applications/actor/base-actor-sheet.mjs`.
  - Actor sheets: `src/module/applications/actor/*.mjs`.
  - Item sheets: `src/module/applications/item/*.mjs`.
  - Sheet mixins: `src/module/applications/api/*.mjs`.
- Utilities and helpers
  - Calculators/processors: `src/module/utils/*.mjs`.
  - Helpers: `src/module/helpers/*.mjs`.
  - Dice/rolls: `src/module/dice/*.mjs`.

## Data Flow
- System boot
  - `src/module/rogue-trader.mjs` registers hooks, helpers, and enrichers.
  - `src/module/hooks-manager.mjs` wires Foundry lifecycle hooks and registers documents/sheets.
- Actor data preparation
  - `Actor.prepareData()` triggers DataModel `prepareBaseData()` and `prepareDerivedData()`.
  - Document layer invokes DataModel `prepareEmbeddedData()` to apply item modifiers.
  - Calculators run for armour/encumbrance (e.g., `src/module/utils/armour-calculator.mjs`).
- UI rendering
  - ApplicationV2 sheets build context in `_prepareContext` and render PARTS templates.
  - Action handlers are declared in `static DEFAULT_OPTIONS.actions` and referenced via `data-action` in templates.

## External Integrations
- Foundry VTT APIs: `Hooks`, `CONFIG`, `DocumentSheetConfig`, `TextEditor`, `Toast`, `Roll`.
- Compendium build uses LevelDB via `classic-level` in `gulpfile.js`.
- Required Foundry module: `game-icons-net` (`src/system.json`).

## Configuration
- System manifest: `src/system.json`.
- Package metadata and scripts: `package.json`.
- Linting: `.eslintrc.json`.
- Formatting: `.prettierrc`.
- Build pipeline: `gulpfile.js`.

## Build & Deploy
- Build commands (from `package.json`):
  - `npm run build` (full build via Gulp)
  - `npm run scss` (SCSS only)
  - `npm run packs` (compendium packs)
  - `npm run watch` (watch mode)
- Output locations:
  - `dist/` is used as a build output target per project docs.
  - `gulpfile.js` copies compiled assets to the Foundry data path configured in `BUILD_DIR`.
