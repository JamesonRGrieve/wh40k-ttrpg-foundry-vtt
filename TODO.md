# WH40K-RPG — Post-Audit Improvement Plan

**Status:** PLAN ONLY — awaiting explicit "launch" before any parallel agents run.
**Created:** 2026-05-30. **Mode:** large `src/` + packs refactor, executed workstream-by-workstream against the repo gates (typecheck / lint / vitest / storybook / ratchets). Book-audit queue is **held** (separate concern).
**Concurrency:** the packs submodule is a shared tree with another agent working `dark-heresy-1/*`. All code work here is in the **parent repo** (`src/module`, `src/templates`, `system.json`, `gulpfile.js`) which the other agent does not touch; content-pack edits (R1 migration) stay off `dark-heresy-1/`.

---

## Settled decisions (design session 2026-05-30)

- **Vehicle hierarchy, full DRY:** `vehicle` is the abstract **base**; concrete craft subtypes by locomotion: **`terracraft`** (land), **`aircraft`** (air), **`watercraft`** (water), **`voidcraft`** (void). `voidcraft` replaces `starship`/`voidship` (chosen for naming symmetry); it extends the base but carries its full ship-build schema.
- **Type strings keep per-line prefixes** this pass (`rt-voidcraft`, `dw-terracraft`, … + bare). Type **de-prefixing stays a separate tracked effort** (CLAUDE.md).
- **Vehicle actor pack scheme:** new `vehicles-` group prefix — `<line>-<book>-vehicles-{terracraft,aircraft,watercraft,voidcraft}` — migrating from `actors-vehicles` / `actors-ships`.
- **Dreadnoughts/Defilers stay `npc`** (interred being / daemon engine — not craft).
- **Adventures:** DRY source (scenario flag + UUID refs), **build resolves to a true Foundry Adventure with embedded copies** (`journal`/`scenes`/`actors`/`items` are `SetField(EmbeddedDataField)` — confirmed in `.foundry-release/common/documents/adventure.mjs`).
- **Variants extend to actors** (npc/bestiary + all craft types) via the `item-variant-utils` pattern (per-line + `__books`).
- **Locations:** new **structured `location` DataModel** type across all lines.
- **Food/drink → `items-consumables`** (official), mirroring the homebrew consumables compendium.
- **Patrons & Endeavours:** keep the just-ratified `patrons` / `endeavours` group prefixes (no change).

---

## R1 — Vehicle hierarchy + `starship`→`voidcraft` rename

**Goal:** `vehicle` base DataModel → `terracraft`/`aircraft`/`watercraft`; rename `starship`→`voidcraft` (extends base, retains ship-build system). Register types, split sheets/templates, migrate content by locomotion.

**Scope (measured):** `starship` appears in **~176 files**. Vehicle/ship content: dh2 10, dw 5, ow 36, rt 38 vehicles + rt 51 ships. Sheets: `vehicle-sheet.ts`, `starship-sheet.ts` (+ stories). Templates: `src/templates/actor/vehicle/`, `src/templates/actor/starship/`. Types: `system.json` documentTypes (`*-vehicle`, `rt-starship`, bare `vehicle`/`starship`).

**Design notes:**
- Base `vehicle` (abstract): `locomotion` discriminator, integrity, crew, weapons, availability, size, faction — the genuinely shared spine.
- `terracraft`: current `vehicle.ts` ground fields (directional `armour{front/side/rear}`, speed{cruising/tactical}, manoeuvrability, carryingCapacity).
- `aircraft`: terracraft-like + `altitude`/ceiling/air-agility (vehicle already has `altitude`).
- `watercraft`: + draft/seaworthiness (no official content yet — schema only).
- `voidcraft`: full ship-build schema from `starship.ts` (SP budget, components[], void shields, space/power, weapon arcs, crit statuses, modifier engine).

**Partition (disjoint, parallel-safe):**
- **A (me):** DataModels `data/actor/{vehicle(base),terracraft,aircraft,watercraft,voidcraft}.ts` + co-located tests + `_module.ts` registration.
- **B (single-owner):** `system.json` documentTypes block (rename `*-starship`→`*-voidcraft`, add `*-{terracraft,aircraft,watercraft}`).
- **C:** sheets `applications/actor/{vehicle→terracraft/…, starship→voidcraft}-sheet.ts` + stories; **D:** `src/templates/actor/{vehicle,starship}/` rename/split + panel/partial/chat refs.
- **E (per-line, disjoint dirs):** content type-string migration + **locomotion classification** — known aircraft: DW Thunderhawk, OW Ork Bommer; default land→`terracraft`; rt ships→`voidcraft`. Pack rename `actors-vehicles`/`actors-ships` → `vehicles-<craft>`; update `Compendium.*` UUID refs.
- **F (single-owner):** langpack `WH40K.HullType.*` etc. + `uuid`/path refs.

**Verify:** `pnpm typecheck && pnpm test`, storybook for the new sheets, `packs:validate`, drift check. **Depends on:** nothing (do first). **Blocks:** R2 (needs final actor types).

---

## R2 — Variant mechanism → actors

**Goal:** extend `item-variant-utils.ts` (per-line container + `__books`/`__canonical`, already generic in `materializeItemVariants`) to actor types so a creature is one canonical doc with per-line/per-book stat variants. Resolves the deferred P57 divergences + cross-line reprints.

**Scope:** `getMaterializedItemSource`/`inferActiveGameLine` are item-centric; add an **actor** entry point + call it in actor `prepareData`. Apply to: the 5 dw-xenos divergences (Lictor wounds, Knarloc T, Broadside BS, Ripper dmg; Vespid re-verify — looked spurious), and re-home BC Necron reprints (P65 — currently per-book copies; optional).

**Partition:** mostly single-surface (`utils/` + actor base DataModel + tests) → **me**, plus a content pass to apply `__books` to the flagged canonical actors (one agent). **Verify:** unit tests on the actor resolver; confirm a divergent creature renders the right per-book stats. **Depends on:** R1 (actor types final).

---

## R3 — Adventure build-resolver (true Foundry Adventure)

**Goal:** keep `_source` adventure docs DRY (scenario flag + `@UUID`/UUID refs); at `gulp packs` build, resolve into valid Foundry **Adventure** documents that **embed copies** of referenced Actors/Items/Scenes/Tables into the `journal`/`scenes`/`actors`/`items` `SetField`s. Define the `flags['wh40k-rpg'].scenario` schema formally + write the runtime consumer (none exists yet).

**Scope:** `gulpfile.js` already has reference-stub resolution (`resolveReferencePath`, `compilePacks`) to model on. 7 existing adventure docs (ow×3, bc×3, im×1) — normalize to the DRY source shape the resolver expects. Foundry schema: `.foundry-release/common/documents/adventure.mjs`.

**Partition:** **me** (build transform in gulpfile + a `scenario` schema/validator + source-shape normalization of the 7 docs). **Verify:** build a sample line, import-shape check against the Foundry Adventure schema; `packs:validate`. **Depends on:** R1/R2 lightly (UUIDs stable). Independent enough to run in parallel.

---

## R4 — `location` DataModel (new structured type)

**Goal:** structured `location` type (fields: parent/region/coords/sector/tags + metadata), across all lines, replacing prose-only location handling. Mostly metadata-flavour but queryable.

**Scope:** existing content `dh2-core-locations`, `dh2-within-locations` (migrate to the new type). Pack scheme `<line>-<book>-locations`. New DataModel + registration + sheet + template + langpack. IM Macharian Sector worlds → locations (R6 overlap).

**Partition:** **me** (DataModel + sheet/template + registration) + a content agent (migrate dh2 locations, author IM worlds). **Verify:** typecheck/test/story. **Depends on:** nothing; parallel-safe.

---

## R5 — Journal → mechanical-object graduations (assessment first)

**Goal:** decide which currently-journal/prose content graduates to structured DataModel-backed types. Candidates: IM **Endeavours** (downtime activities w/ tests/costs), **Subtlety** system, **Patrons** (kept as journal per decision), conditions/critical-injuries (already item-typed — confirm). 

**Partition:** **me** — produce an assessment doc + proposed schemas; no build until you pick which graduate. **Depends on:** R1 patterns. **Output:** a decision list appended here.

---

## R6 — Untracked book sections (gap-fill)

**Goal:** represent sections no pack type currently covers.
- **Food/drink → `items-consumables`** (official) — IM Amasec/Corpse-Starch/Recaf, etc.
- **Locations** — handled by R4 (Macharian Sector worlds, etc.).
- **Curios / mission-generator / GM-screen / skill-specialisation extensions** — enumerate, decide track-or-skip (some are GM-reference, some are RollTables).

**Partition:** content agents per line/section (disjoint), after R4 (locations) lands. **Depends on:** R4.

---

## R7 — CLAUDE.md schema updates (cross-cutting)

Threaded through R1–R6: document the vehicle hierarchy + `vehicles-<craft>` pack scheme + `voidcraft`; the actor-variant mechanism; the Adventure build-resolver + `scenario` schema; the `location` type; food/drink routing. **Owner:** me, folded into each workstream's commit.

---

## R8 — IM divergent-stat reconciliation (homologation-first; minimal IM-specific code)

**Goal:** full IM support reusing existing FFG mechanics; add only what FFG genuinely lacks. **Verified analogues (no new engine/types):** Critical Wounds → existing `wounds.critical`; Resolve → existing **Fate** resource; Success Levels → existing `degreesOfSuccess()` (parameterized); force fields → `force-field.ts` (`protectionRating`/overload); Warp Rating → psychic `psy`/`focusPower.threshold`. IM skills already fit the shared skill-map; characteristics fit the shared full-name block.

**Work (mapping/normalization, not new code):**
- **Content field-normalization** — align IM actor JSON to the shared NPC model: `attacks[]`→`weapons[]`, `traits[]`→`talents_traits`, `Str/Tgh/Wil`→`strength/toughness/willpower` (skills-map already aligns).
- **Thin shared-base additions** (benefit all lines): promote crit track to `{value,max}`; add `role`/`tier` (Troop/Elite/Leader ≈ FFG Troops/Elite/Master).
- **Variantize divergent ITEM stats** via the `im` branch (reuses R2/R4 machinery): weapon `N×StrB` / qualitative range bands, condition Minor/Major split, single-roll-per-location crit + Treatment, Warp Rating value. DataModels read the resolved `im`-branch value.
- **`im-config.ts`** — set IM's degrees-of-success/SL parameters + crit-table refs.
- **Templates** — render IM through the **shared** actor/item templates with minimal conditional sections (Resolve/Warp Rating labels); **no separate `*-im.hbs` set**.

**Micro-defaults (override if you disagree):** Resolve = shared Fate field, IM-labelled; crit track → `{value,max}` for all lines; `role`/`tier` shared NPC metadata.

**Partition:** mostly single-surface (im concrete models + shared-base tweaks + `im-config` + a content-normalization pass) → me + one content agent. **Verify:** typecheck/test + render an IM NPC / weapon / psychic power. **Depends on:** R1 (actor types), R2 (variant resolver on actors).

---

## Ordering / dependencies

```
R1 (vehicle/voidcraft) ──┬──> R2 (actor variants) ──> R8 (IM reconciliation)
                         └──> R7 (docs, per-workstream)
R3 (adventure resolver) ── independent ──> R7
R4 (location type) ── independent ──┬──> R6 (gap-fill)
                                    └──> R7
R5 (journal graduations) — assessment, gated on your picks
R8 (IM reconciliation) — needs R1 (actor types) + R2 (variant resolver)
```
**Suggested launch order:** R1 first (foundational, biggest), then R3 + R4 in parallel (independent), then R2 (needs R1) → R8 (needs R1+R2), then R6, with R5 as an assessment running alongside. R7 commits land with each.

## Parallel-agent launch checklist (when authorized)
- Sync `origin/main` into the working branch first.
- Partition exactly per the disjoint scopes above; single-owner files (`system.json`, `gulpfile.js`, `handlebars-manager.ts`, langpack, `_module.ts`) assigned to exactly one agent each.
- Worktree isolation, `--no-verify`, no push/PR; orchestrator does one batched `pnpm check` + ratchet pass at the end.

## Deferred / carried-over
- P57 dw-xenos `__books` divergences → **R2**. P65 BC Necron reprints → **R2** (optional re-home). Vespid divergence → re-verify in R2 (looked spurious).
- `im-npc`/`im` DataModel rendering for IM's divergent stat shape → now planned as **R8** (homologation-first; verified to need almost no IM-specific code).

---

## R1+R3+R4 GLUE RECONCILE — WIP checkpoint (2026-05-30, pre-compaction)

All 5 agents (R1-models/ui/content, R3, R4) completed; their output + my partial glue are committed as a **non-compiling WIP checkpoint** on the current branch. **Do NOT assume it compiles.** Resume the glue here, then verify (`pnpm typecheck` → `pnpm check` + ratchets) and do the final commit.

**GLUE DONE:**
- `data/actor/bases/`: removed orphan `vehicle-base.ts`/`starship-base.ts`; updated `bases/_module.ts` + `actor/_module.ts` (dropped base re-exports; added generic exports `VehicleData`/`ConventionalCraftData`/`TerracraftData`/`AircraftData`/`WatercraftData`/`VoidcraftData`).
- `applications/actor/_module.ts`: `VehicleSheet`→`CraftActorSheet`, `StarshipSheet`→`VoidcraftActorSheet`.
- `game-system-sheets.ts`: per-line `*VehicleSheet`→`*CraftSheet` (extend `CraftActorSheet`); `RogueTraderStarshipSheet`→`RogueTraderVoidcraftSheet` (extend `VoidcraftActorSheet`); imports fixed.
- `hooks-manager.ts`: `CONFIG.Actor.documentClasses` map rewritten (new terracraft/aircraft/voidcraft keys + legacy fallbacks; `rt-starship`/`starship`→`WH40KRTVoidcraft`).

**GLUE REMAINING (resume order):**
1. `hooks-manager.ts`: (a) `CONFIG.Actor.dataModels` map — rename values `*VehicleData`→`*TerracraftData`, `RTStarshipData`→`RTVoidcraftData`; add `*-terracraft`→`*TerracraftData`, `*-aircraft`→`AircraftData`, `rt-voidcraft`/`voidcraft`→`RTVoidcraftData`, `watercraft`→`WatercraftData`; keep legacy keys. (b) `CONFIG.Item.dataModels`: add `location: dataModels.LocationData`. (c) per-line sheet imports (~L30-38) `*VehicleSheet`→`*CraftSheet`, `RogueTraderStarshipSheet`→`RogueTraderVoidcraftSheet`. (d) sheet registration: register per-line `*CraftSheet` for `{line}-terracraft/aircraft/watercraft`, `RogueTraderVoidcraftSheet` for `rt-voidcraft`, `LocationSheet` for Item `location`. (e) ~L968 string-match `'wh40k-rpg.VehicleSheet'`.
2. `types/fvtt-config.ts`: `DataModelConfig.Actor` rename (`*VehicleData`→`*TerracraftData`, `RTStarshipData`→`RTVoidcraftData`) + add craft/voidcraft keys + imports; `DataModelConfig.Item` add `location: typeof LocationData` + import.
3. Documents layer (broken imports — they import the renamed data classes): `documents/concrete/*-vehicle.ts` (import `*TerracraftData`); `documents/concrete/rt-starship.ts`→`rt-voidcraft.ts` (`WH40KRTStarship`→`WH40KRTVoidcraft`); `documents/starship.ts`→`voidcraft.ts` (`WH40KStarship`→`WH40KVoidcraft`); `documents/bases/starship-doc-base.ts`→`voidcraft-doc-base.ts` (`StarshipDocBase`→`VoidcraftDocBase`); fix `documents/{vehicle,bases/vehicle-doc-base}.ts` imports; update `documents/{_module,bases/_module,concrete/_module}.ts` barrels.
4. `data/item/_module.ts`: export `LocationData` (`./location.ts`). `applications/item/_module.ts`: export `LocationSheet`.
5. `system.json`: `documentTypes.Actor` add craft/voidcraft types (per-line + bare; keep legacy); `documentTypes.Item` add `location:{htmlFields:["description.value"]}`; `packs[]` rename the 26 vehicle/ship packs per R1-content's old→new map (in its report).
6. `handlebars-manager.ts`: preload `actor/vehicle/*`→`actor/craft/*`, `actor/starship/*`→`actor/voidcraft/*` (~L147-153,161-169,274); add `item-location-sheet.hbs`.
7. `config.ts`: vehicleType icon (minor).
8. i18n `en.json`: `WH40K.Starship.*`→`WH40K.Voidcraft.*` (keys+values, ~235) + add `WH40K.Vehicle.{Locomotion,Altitude,Ceiling,Draught,ArmourFront/Side/Rear,LocomotionType.*,AltitudeTier.*,SpeedCruising/SpeedTactical,CarryingCapacity,Statistics,Repaired,ComponentRepaired/Damaged,…}` + `WH40K.Location.*` (full lists in R1-ui/R4 reports); update consumers (7 `ship-*`/`*-action` chat templates + `rules/ship-manoeuvres.ts` + `documents/voidcraft.ts`); `pnpm i18n:gen` to regen `i18n-keys.d.ts`.
9. `gulpfile.js`: `collectionForPack`/`detectCollectionType` — treat `vehicles-*` packs as Actor (R3 finding).
10. Adventures: `ow-adventures/{old-soldiers,final-testament}.json` — repoint 3 vehicle UUIDs to the new `*-vehicles-terracraft` packs (`OWGMkV1SupplyTruk`, `OWTstScutum036`, `OWTstTauros038`).
11. Tests: `data/actor/vehicle.test.ts` — retarget getters to `ConventionalCraftData`; cosmetic local names in `voidcraft.test.ts`/`rt-terracraft.test.ts`.
12. Stray refs: `utils/actor-system-converter.ts`, `applications/dialogs/create-actor-dialog.ts`, `documents/base-actor.ts` — old type strings/model names.
13. `homebrew/hb-rt-actors-vehicles` (31 land) → migrate to `hb-rt-vehicles-terracraft`, type `*-terracraft` (per user).
14. Then: `pnpm typecheck` → fix → `pnpm check` + ratchets → fix → final verified commit. Also verify location `tags` ArrayField vs comma-string form (R4 flagged).
