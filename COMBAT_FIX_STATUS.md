# Combat system fix — status & remaining work

Branch: `combat-fix-ad30371238cb8458d`
Worktree: `.foundry-system/.claude/worktrees/agent-ad30371238cb8458d-combat`
Base commit: `7ad1d29de` (inner Foundry repo, `.git/modules/.foundry-system`)

> NOTE ON ENVIRONMENT: the originally-assigned worktree
> (`.claude/worktrees/agent-ad30371238cb8458d/.foundry-system`) was **empty/broken** —
> its tracked tree was a dangling `160000` gitlink to a commit (`aa733431`) that does
> not exist in the object store. The real Foundry system repo lives at
> `/home/jameson/Documents/dh-campaign/.foundry-system` (HEAD `7ad1d29de`). I created a
> proper worktree off that repo (path above) and did all work there. `node_modules` is a
> symlink to the main checkout's install so `tsc`/`vitest`/`eslint` run without a fresh
> `pnpm install`.

---

## Root-cause diagnosis (the 4 reported bugs)

1. **Combat action buttons don't work (quick panel).**
   `CombatQuickPanel` calls `this.actor?.rollWeaponAttack?.(weaponId, …)`, but
   `rollWeaponAttack` was **never defined on any actor class** — only declared as an
   optional method on the panel's local `CombatPanelActor` interface. The optional-chain
   call silently no-opped, so Standard/Semi/Full-auto attack buttons did nothing.
   - Sheet-side combat buttons (CharacterSheet `attack`/`dodge`/`parry`/`combatAction`,
     WeaponSheet `rollAttack`) and chat-card `data-action="attack"` (routed via
     `documents/chat-message.ts` `onChatCardAction`) were already wired and are NOT the
     break. The quick panel was the dead path.

2. **Can't select targets.** `TargetedActionManager.getTargetToken()` reads
   `game.user.targets` correctly. The reason targeting appeared broken from the quick
   panel is the same bug #1 — quick-panel attacks never reached the targeted-action
   manager (the missing `rollWeaponAttack`), so target resolution never ran. Routing the
   panel through `rollItem → performWeaponAttack` restores `game.user.targets` handling
   (zero/multi-target already handled gracefully with notifications).

3. **Damage not auto-rolled.** `ActionData.performActionAndSendToChat()` posted the
   attack card (with a manual "Roll Damage" button) and stopped. `calculateHits()` +
   damage card only ran on a manual chat-button click (`BasicActionManager._rollDamage`).

4. **No auditing.** The attack card already had a modifier breakdown + DoS/DoF and the
   damage card already showed formula/result/per-hit modifiers/penetration/effects — but
   there was no explicit line tying the d100 result to the final modified target.

---

## What was done (all committed)

- **`src/module/documents/base-actor.ts`** — added `rollWeaponAttack(weaponId, options)`
  on `WH40KBaseActor`; delegates to `rollItem` (→ targeted-action manager). Available to
  all 7 systems + PC/NPC subclasses. Fixes bugs #1 and #2.
- **`src/module/applications/hud/combat-quick-panel.ts`** — `CombatPanelActor.rollWeaponAttack`
  is now non-optional; the three attack handlers call `rollWeaponAttack(...)` without the
  `?.` no-op.
- **`src/module/wh40k-rpg-settings.ts`** — new world setting `autoRollDamage` (default on)
  + `isAutoRollDamageEnabled()`.
- **`src/module/rolls/action-data.ts`** — `performActionAndSendToChat` now calls new
  `maybeAutoRollDamage()`: on a hit (or thrown), gated by `autoRollDamage`, it
  `calculateHits()` (idempotent) + propagates attack DoS to each hit + posts the damage
  card via `DHBasicActionManager._postDamageCard`. Skips target-only posts. Fixes bug #3.
- **`src/module/actions/basic-action-manager.ts`** — `_rollDamage` is now idempotent
  (skips `calculateHits` if hits already exist) so manual + auto can't double-roll. The
  manual button + assign-damage flow are preserved.
- **`src/templates/chat/action-roll-chat.hbs`** — added a "Roll vs Target" audit row
  (`{{roll.total}} vs {{modifiedTarget}}`) after the modifier breakdown. Bug #4.
- **`src/lang/en.json`** — added `WH40K.SETTINGS.AutoRollDamage.*` and
  `WH40K.Roll.Audit.*` (RollVsTarget / RollResult / AgainstTarget). All new keys under
  the allowed namespaces.
- **`tests/combat-resolution.test.ts`** — 14 Vitest cases (action dispatch, target
  resolution, hit→auto-damage trigger + gating + idempotency + DoS propagation, modifier/
  formula breakdown assembly, seeded-RNG determinism). Lives in `tests/` (not co-located)
  because it imports `seedRandom` from `stories/mocks/extended.ts`, which is outside the
  main tsconfig `rootDir: src` — co-locating tripped TS6059. `tests/` is the established
  home for heavy-module-graph tests (cf. `tests/build-simple-skill-roll.test.ts`).

## Verification done (scoped to my work)

- `pnpm typecheck` (main tsconfig): **0 errors**.
- `tsc -p tsconfig.test.json`: **0 errors** for the new test.
- `eslint` on every touched file + the new test: **0 errors/0 warnings**.
- `vitest run` on `tests/combat-resolution.test.ts` (14 pass) and the existing
  `combat-actions*` / `combat-circumstance-modifiers` suites (28 pass).

---

## Remaining work / TODO (for the next session)

### Must-do before merge
- [ ] **Storybook `play`-function stories** (required by the brief, NOT yet done):
      extend `stories/RollCards.stories.ts` (chat-roll-cards) and the skill-card stories
      with `play` assertions that (a) click each combat action control and assert the
      dispatched outcome, and (b) assert the rendered breakdown incl. the new
      "Roll vs Target" audit row and the auto-rolled damage card. Use `withSystem(...)`
      to cover all 7 systems (DH2 flat −20 untrained, NOT ÷2).
- [ ] **Run the orchestrator's batched verification** — I did NOT run the full
      `pnpm check`, ratchets (`*:ratchet`), `storybook-pw`, `preload:drift`, or `i18n:gen`
      (per the brief). Expect to:
      - regenerate `src/module/types/i18n-keys.d.ts` via `pnpm i18n:gen` for the new
        langpack keys (the build/typed-`t()` surface needs it; I used plain `localize`
        in the template so runtime is fine, but the i18n freshness gate will want regen);
      - run `pnpm symmetry` — confirm the `tests/combat-resolution.test.ts` placement
        doesn't disturb the data↔test pairing baseline;
      - run `pnpm test:typecheck:ratchet` / `lint:ratchet` to confirm no baseline drift.

### Audit (bug #4) — possible enhancement, not blocking
- The brief asks each modifier to carry `{label, value, source}`. Current breakdown shows
  `label → signed value` (the internal key IS the source, e.g. `ATTACK`, `TARGET-SIZE`,
  `WEAPON-TRAINING`). If a richer per-modifier *source attribution* is wanted (e.g.
  "Aim (+10, half action)" vs raw key), `RollData.activeModifiers` would need to return
  `{label, value, source}[]` and `modifier-breakdown.hbs` updated to render it, with
  langpack labels for each modifier key. Left as-is for now since the keys are already
  human-readable and the explicit Roll-vs-Target line closes the core audit gap.

### Tier B (needs a running licensed Foundry — I could not verify)
- [ ] Live click-through of the **combat quick panel** Standard/Semi/Full-auto buttons
      against a real DH2 actor with an equipped weapon + a targeted token — confirm the
      attack dialog opens and the target flows through.
- [ ] Confirm **auto-roll damage** fires end-to-end on a real hit and that the manual
      "Roll Damage" button (with `autoRollDamage` off) still works and does not double-roll.
- [ ] Confirm the **assign-damage** button still appears on the auto-posted damage card
      (the `chat-roll-cards--damage-with-assignable-hit` story path) and assigns correctly.
- [ ] Verify the `.wh40k-rpg` ancestor still lands on the auto-posted damage card so it
      isn't an unstyled white box (it goes through the same `postChatCard` +
      `renderChatMessageHTML` hook as the manual path, so expected fine).
- [ ] Homologation spot-check across all 7 systems (BC/DH1/DH2/DW/OW/RT/IM) that the
      new base-actor `rollWeaponAttack` and auto-damage behave (the changes are on shared
      base classes / shared ActionData, so expected uniform).

### Notes / risks
- `CombatQuickPanel.#dodge/#parry` call `rollSkill('dodge', { skipDialog: true })` —
  passing an options object as the 2nd arg, which matches neither the acolyte
  (`skillName, speciality, options`) nor npc (`skillName, flavor`) signature. This is a
  **pre-existing latent mismatch**, left untouched (out of the reported-bug scope and
  risky for 7-system homologation). Flagged here for awareness.
- The auto-damage path reuses `DHBasicActionManager._postDamageCard`, which already tags
  hits with the Explosive quality and offers DoS replacement — so auto and manual produce
  identical damage cards.
