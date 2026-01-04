# Architecture Overview

## Current State (Fork + RT MVP Scaffolding)

- Manifest: `src/system.json` (system id `rogue-trader`, ES module entry `module/rogue-trader.mjs`).
- Actor schema: `src/template.json` (actor types `acolyte`, `character`, `npc`, `vehicle`).
- Actor documents: `src/module/documents/base-actor.mjs`, `src/module/documents/acolyte.mjs`, `src/module/documents/vehicle.mjs` (acolyte class shared by `acolyte` + `character`).
- Actor sheets: `src/module/sheets/actor/actor-container-sheet.mjs`, `src/module/sheets/actor/acolyte-sheet.mjs`, `src/module/sheets/actor/npc-sheet.mjs`, `src/module/sheets/actor/vehicle-sheet.mjs` (acolyte sheet shared by player-facing actor types).
- Actor sheet templates: `src/templates/actor/*` (e.g., `src/templates/actor/actor-acolyte-sheet.hbs`).
- Item schema and types: `src/template.json` (weapon, armour, talent, gear, etc.).
- Item sheets: `src/module/sheets/item/*`.
- Roll flow:
  - Base roll helpers: `src/module/rolls/roll-helpers.mjs`.
  - Roll data + degree logic: `src/module/rolls/roll-data.mjs`, `src/module/rolls/action-data.mjs`.
  - Prompts: `src/module/prompts/*` (simple roll, weapon roll, psychic roll).
  - Chat cards: `src/templates/chat/*`.
- Build pipeline: `gulpfile.js` compiles SCSS and packs into `build/rogue-trader/` (see `package.json` scripts).

## Planned Rogue Trader Architecture (Target)

### Actor Types

- `character`: player characters (Explorer, Rogue Trader, etc.).
- `npc`: non-player characters.
- `ship`: voidships and ship crews.

### Item Types

- `weapon`, `armour`, `talent`, `gear` (carry forward with Rogue Trader-specific fields).
- `shipComponent` (bridge, drives, weapons, augur arrays).
- `shipCargo` (optional later phase).

### Derived Data Pipeline

- Continue using the actor document’s `prepareData()` and/or `prepareDerivedData()` to compute totals.
- Derived values will include:
  - characteristic totals (starting + advances + modifiers - fatigue penalties),
  - skill targets (trained/untrained logic),
  - fatigue effects, and
  - ship component totals (power, space, hull).

Location for derived data (planned):

- `src/module/documents/base-actor.mjs` (or a new `rogue-trader-base-actor.mjs`).
- Keep per-actor overrides in their specific document classes.

### Roll Flow

1. Sheet button click (actor sheet template) calls a roll handler.
2. Roll handler builds roll data and calls a roll helper (simple 1d100 for MVP).
3. Chat card rendered via a dedicated template (MVP uses a simple success/fail card).

Planned location:

- MVP: reuse or adapt `src/module/prompts/simple-prompt.mjs` and `src/module/rolls/action-data.mjs`.
- Chat card template: new file under `src/templates/chat/` (verify naming in repo before adding).

## Notes

- System rename to `rogue-trader` is applied in `src/system.json`, build tooling, and template paths.
- Any API usage not explicitly confirmed in the current repo should be verified against the existing fork codebase before implementation.
