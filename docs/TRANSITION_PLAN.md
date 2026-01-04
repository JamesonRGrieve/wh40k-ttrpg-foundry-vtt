# Rogue Trader Transition Plan

## Goals

- Deliver a Rogue Trader system from the original fork in phased milestones.
- Keep the system loadable in Foundry throughout development.
- Avoid shipping any copyrighted rulebook text or art.

## Suggested Branching

- Suggested branch: `feature/rogue-trader-migration-plan` (create locally when you are ready; not created by this change).

## What Stays From the Fork

- Core roll helpers (1d100, degree math) and chat message pipeline.
- Prompt + chat-card rendering flow.
- Item container model and pack build tooling (gulp + pack compiler).
- Macros/hotbar and general actor sheet framework.
- SCSS build pipeline and static asset layout.

## What Changes

- System id/title/manifest and package naming updated to `rogue-trader`.
- Actor types: replace/rename `acolyte` with `character` and add `ship` actor type.
- Actor schema: Rogue Trader characteristics, skills, wounds/fate/fatigue, and ship stats.
- Sheet templates: new Rogue Trader layouts, based on Roll20 reference sheet.
- Roll logic: RT-specific skill training rules and fatigue penalties.
- Ship support: components, power/space totals, and ship actions.

## Phases

### Phase 0 - Planning and Guardrails (Now)

Tasks

- [x] Add migration docs and mapping references.
- [x] Add Roll20 reference assets under `reference/roll20/`.
- [x] Add content policy (no copyrighted material).
- [x] Update `.gitignore` for local Foundry data and build artifacts.

Acceptance Criteria

- [x] Docs exist under `docs/` with migration plan, architecture, Roll20 mapping, and dev install steps.
- [x] `reference/roll20/` contains the Roll20 HTML/CSS/metadata and a README.
- [x] Repo still loads as Rogue Trader in Foundry.

### Phase 1 - MVP (Character Sheet + Basic Rolls)

Scope (required)

- Character actor sheet opens and can edit:
  - core characteristics (WS/BS/S/T/Ag/Int/Per/WP/Fel)
  - wounds, fate points, fatigue
  - skills list with trained/+10/+20 and computed target
- Roll button for a skill/characteristic:
  - rolls 1d100
  - compares to target
  - outputs success/fail + degrees in chat
- No compendiums with rule text. No ship combat automation.

Tasks

- [x] Add `character` actor type to `src/template.json` and wire into `src/module/hooks-manager.mjs`.
- [x] Define RT-specific characteristic and skill fields (aligned with `docs/ROLL20_TO_FOUNDRY_MAPPING.md`).
- [x] Implement derived data computation for characteristic totals and skill targets (fatigue penalties included).
- [x] Add a minimal Rogue Trader character sheet template and sheet class.
- [x] Add a simple roll handler and chat card for skill/characteristic rolls.
- [x] Ensure the system still loads even if `acolyte` sheets remain (no breakage).

Acceptance Criteria

- [ ] Creating a `character` actor opens the new sheet without console errors. (verify in Foundry)
- [ ] Core characteristics, wounds, fate, fatigue, and skills are editable. (verify in Foundry)
- [ ] Skill/characteristic roll button produces a 1d100 roll with success/failure and degrees in chat. (verify in Foundry)

### Phase 2 - Expanded Character Features + Items

Tasks

- [ ] Add weapon, armour, talent, and gear item types with RT fields.
- [ ] Inventory view on the character sheet.
- [ ] Basic combat roll flow (attack/defense) using RT rules.
- [ ] Migrate or adapt existing chat cards for weapon attacks.

Acceptance Criteria

- [ ] Item sheets open and persist data.
- [ ] Attacks roll in chat with target, DoS/DoF, and basic damage summary.

### Phase 3 - Ship Support (Foundations)

Tasks

- [ ] Add `ship` actor type and sheet with core ship stats.
- [ ] Add ship component item type and repeating lists (power/space/SP totals).
- [ ] Add ship roll helpers for voidship actions (navigation, gunnery, etc.).

Acceptance Criteria

- [ ] Ship sheet opens and computes component totals correctly.
- [ ] Basic ship rolls appear in chat.

## System Rename (Applied)

Applied updates

- `src/system.json` updated (`id`, `title`, `manifest`/`download`, `compatibility` retained).
- `SYSTEM_ID` updated in `src/module/hooks-manager.mjs`.
- All `systems/rogue-trader/...` template paths updated in prompts/rolls/templates.
- Build output path updated in `gulpfile.js` (`BUILD_DIR`).
- `package.json` name/description updated.

Verification (still required)

- [ ] System loads in Foundry with id `rogue-trader`.

## Release/Manifest Approach (GitHub Releases)

- Create a GitHub Release for each version.
- Attach the built zip from `build/rogue-trader/`.
- Host `system.json` at the release URL or a stable branch.
- Update `manifest` and `download` in `system.json` to point to the latest release.

## Risks and Mitigations

- Risk: Hard-coded template paths tied to `rogue-trader` break after rename.
  - Mitigation: search/replace all `systems/rogue-trader` paths and verify in Foundry.
- Risk: RT skill list differs significantly from the original fork schema.
  - Mitigation: isolate RT skill data in a new schema block and keep legacy schema untouched until RT sheet is ready.
- Risk: Ship rules require complex derived data and repeating sections.
  - Mitigation: stage ship support to Phase 3 and keep it non-automated initially.
- Risk: Copyrighted text or art accidentally committed.
  - Mitigation: enforce `docs/CONTENT_POLICY.md` and keep all rule text out of packs.
