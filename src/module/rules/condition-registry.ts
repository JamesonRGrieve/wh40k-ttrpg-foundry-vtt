/**
 * The condition registry — this system's ONE definition of its conditions,
 * their artwork, and their mechanical `changes` (#495), plus the pure builders
 * over it.
 *
 * A LEAF module by design. `rules/active-effects.ts` — which owns the impure
 * writers — also imports the chat/roll helpers and the actor document type, so
 * it sits inside a large import cycle. `documents/base-actor.ts` needs only the
 * pure payload builder (to stamp `unconscious` / `dead`), and importing the hub
 * for that closed a `no-circular` loop. Keeping the table and its pure readers
 * here lets every consumer — the token HUD, the effect-creation dialog, the base
 * actor — reach the single source without pulling the hub in.
 */

/**
 * `CONST.ACTIVE_EFFECT_MODES.ADD`, as a literal.
 *
 * The condition registry below is a MODULE-SCOPE table, so it is evaluated at
 * import time — and `CONST` is a Foundry runtime global that does not exist
 * under vitest or in headless tooling. Reading it there threw
 * `ReferenceError: CONST is not defined` and took down every suite that
 * transitively imported this module (assign-damage-data, dynamic-damage,
 * medicae-mechadendrite, combat-resolution, get-reroll-options,
 * build-simple-skill-roll — six suites), because an import-time throw fails the
 * whole file, not one test.
 *
 * Same reasoning `helpers/effects.ts` already documents for its mode literals.
 * The value is fixed by Foundry's own enum and cannot drift.
 */
export const MODE_ADD = 2;

export type EffectChange = {
    key: string;
    mode: number;
    value: number | string;
};

// eslint-disable-next-line no-restricted-syntax -- boundary: duration/flags/extra options are untyped Foundry ActiveEffect fields; shape is open-ended
export type EffectOptions = Record<string, unknown> & {
    name?: string;
    icon?: string;
    duration?: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry duration object is untyped
    origin?: string;
    flags?: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
    changes?: EffectChange[];
};

export type EffectDataInput = {
    name: string;
    icon?: string | undefined;
    changes?: EffectChange[] | undefined;
    disabled?: boolean | undefined;
    origin?: string | undefined;
    duration?: Record<string, unknown> | undefined; // eslint-disable-line no-restricted-syntax -- boundary: Foundry duration object is untyped
    flags?: Record<string, unknown> | undefined; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
    /**
     * Foundry status ids this effect confers (#495). Setting it is what makes an
     * ActiveEffect a *status*: it drives the token status icon and membership in
     * `actor.statuses`, which the rules engine already reads.
     */
    statuses?: string[] | undefined;
};

export type ConditionDefinition = {
    name: string;
    icon: string;
    changes: EffectChange[];
    flags: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
};

/**
 * The canonical condition registry — the ONE definition of this system's
 * conditions, their artwork, and their mechanical `changes` (#495).
 *
 * Hoisted to module scope so `CONFIG.statusEffects` (the token HUD) and
 * `createConditionEffect` (the applied effect) are two views of the same data
 * instead of parallel hand-maintained lists that drift. Each key is the Foundry
 * status id, so `actor.statuses` speaks the same vocabulary the rules engine
 * already matches on.
 */
const CONDITION_REGISTRY: Record<string, ConditionDefinition> = {
    dead: {
        // Reuses Foundry core's `dead` status id, which
        // `CONFIG.specialStatusEffects.DEFEATED` already points at — so the token
        // defeated overlay and the combat tracker's defeated marker come for free
        // instead of needing a parallel system-only id (#495). Carries no
        // `changes`: death is a state, and the mechanical consequences (no
        // actions, lootable body) are driven by the status id itself (#477).
        name: 'Dead',
        icon: 'icons/svg/skull.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', dead: true } },
    },
    burning: {
        // Set on fire (#108). No static stat change — the per-turn tick is
        // driven by the combat turn-hook, which matches on the `Burning`
        // name (combat-action-manager.ts → handleOnFire).
        name: 'Burning',
        icon: 'icons/svg/fire.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', onFire: true } },
    },
    stunned: {
        name: 'Stunned',
        icon: 'icons/svg/daze.svg',
        changes: [
            { key: 'system.combat.defense', mode: MODE_ADD, value: -20 },
            { key: 'system.combat.attack', mode: MODE_ADD, value: -20 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    prone: {
        name: 'Prone',
        icon: 'icons/svg/falling.svg',
        changes: [{ key: 'system.combat.defense', mode: MODE_ADD, value: -20 }],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    blinded: {
        name: 'Blinded',
        icon: 'icons/svg/blind.svg',
        changes: [
            { key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -30 },
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -30 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    deafened: {
        name: 'Deafened',
        icon: 'icons/svg/deaf.svg',
        changes: [{ key: 'system.characteristics.perception.modifier', mode: MODE_ADD, value: -20 }],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    grappled: {
        name: 'Grappled',
        icon: 'icons/svg/combat.svg',
        changes: [
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -20 },
            { key: 'system.characteristics.agility.modifier', mode: MODE_ADD, value: -20 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    inspired: {
        name: 'Inspired',
        icon: 'icons/svg/upgrade.svg',
        changes: [
            { key: 'system.characteristics.willpower.modifier', mode: MODE_ADD, value: 10 },
            { key: 'system.characteristics.fellowship.modifier', mode: MODE_ADD, value: 10 },
        ],
        flags: { 'wh40k-rpg': { nature: 'beneficial' } },
    },
    blessed: {
        name: 'Blessed',
        icon: 'icons/svg/holy-shield.svg',
        changes: [{ key: 'system.combat.defense', mode: MODE_ADD, value: 10 }],
        flags: { 'wh40k-rpg': { nature: 'beneficial' } },
    },
    pinned: {
        // core.md §"Pinning": pinned characters can't move or attack with
        // ranged weapons; melee attacks against them get +20 WS.
        name: 'Pinned',
        icon: 'icons/svg/net.svg',
        changes: [{ key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -20 }],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    unconscious: {
        // core.md §"Unconsciousness": helpless target until healed.
        name: 'Unconscious',
        icon: 'icons/svg/unconscious.svg',
        changes: [
            { key: 'system.combat.defense', mode: MODE_ADD, value: -60 },
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -60 },
            { key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -60 },
            { key: 'system.characteristics.agility.modifier', mode: MODE_ADD, value: -60 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    suffocating: {
        // core.md §"Suffocation": no immediate stat hit, but the GM tracks
        // ladder-state via the flag. Damage accrues outside the AE pipeline.
        name: 'Suffocating',
        icon: 'icons/svg/drowning.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', suffocating: true } },
    },
    bleeding: {
        // Reuses Foundry core's `bleeding` status id. Distinct from `bloodloss`:
        // this is the generic bleeding marker the effect dialog has always
        // offered (its own per-turn handler is `handleBleeding`), whereas
        // `bloodloss` is the Heavily-Damaged blood-loss rule below. Both were
        // matched by DISPLAY NAME before #495, which is why the registry needs
        // both ids for the automation to keep firing.
        name: 'Bleeding',
        icon: 'icons/svg/blood.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', requiresProcessing: true } },
    },
    bloodloss: {
        // core.md §"Blood Loss": persistent 1d10 per turn when Heavily
        // Damaged, plus Toughness test or +1 fatigue. The per-turn tick
        // hooks into `processActiveEffectsDuringCombat` (see settings).
        name: 'Blood Loss',
        icon: 'icons/svg/blood.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', bloodloss: true } },
    },
    uselessLimb: {
        // core.md §"Useless Limbs": loss of use of the limb until healed.
        // The flag carries which limb; sheets / item enforcement consume it.
        name: 'Useless Limb',
        icon: 'icons/svg/sling.svg',
        changes: [],
        flags: { 'wh40k-rpg': { nature: 'harmful', uselessLimb: true } },
    },
    manacled: {
        // Errata p. 176 — Manacles impose −40 to BS and WS tests until removed.
        name: 'Manacled',
        icon: 'icons/svg/chains.svg',
        changes: [
            { key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -40 },
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -40 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
    fatigued: {
        // The manually-applied "Fatigued" status condition — a flat −10 to all
        // characteristics while present. This is DISTINCT from the per-system
        // fatigue TRACK (`system.fatigue.value`), whose effect is resolved by
        // game line in `rules/fatigue.ts` (#114): halving for DH1/DH2, a
        // roll-time flat penalty for RT/DW/OW/BC, IM's condition tiers. This AE
        // surfaces the condition's impact in a player-readable way.
        name: 'Fatigued',
        icon: 'icons/svg/sleep.svg',
        changes: [
            { key: 'system.characteristics.weaponSkill.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.ballisticSkill.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.strength.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.toughness.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.agility.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.intelligence.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.perception.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.willpower.modifier', mode: MODE_ADD, value: -10 },
            { key: 'system.characteristics.fellowship.modifier', mode: MODE_ADD, value: -10 },
        ],
        flags: { 'wh40k-rpg': { nature: 'harmful' } },
    },
};

/** The canonical condition registry, for consumers that need the whole table. */
export function conditionRegistry(): Readonly<Record<string, ConditionDefinition>> {
    return CONDITION_REGISTRY;
}

/**
 * Picker rows for any UI that offers the system's conditions (the token HUD via
 * `CONFIG.statusEffects`, the effect-creation dialog). Derived from the registry
 * so no surface can carry a second, drifting condition list (#495).
 * @returns {Array<{id: string, name: string, icon: string, nature: string}>}  One row per condition.
 */
export function conditionPickerRows(): Array<{ id: string; name: string; icon: string; nature: string }> {
    return Object.entries(conditionRegistry()).map(([id, definition]) => {
        const flags = definition.flags as { 'wh40k-rpg'?: { nature?: string } } | undefined;
        return {
            id,
            name: definition.name,
            icon: definition.icon,
            nature: flags?.['wh40k-rpg']?.nature ?? 'neutral',
        };
    });
}

/**
 * The ActiveEffect creation payload for a registry condition — the PURE half of
 * {@link createConditionEffect}, with no actor and no database write.
 *
 * Exists so every writer builds its condition from the registry instead of
 * hand-rolling a "mirrors the def" copy (#495). Returns null for an unknown id.
 * @param {string} condition  Registry key / Foundry status id.
 * @param {EffectOptions} [options]  Per-application overrides (name, extra flags, duration…).
 * @returns {EffectDataInput | null}  The payload, or null when the id is unknown.
 */
export function conditionEffectData(condition: string, options: EffectOptions = {}): EffectDataInput | null {
    const id = condition.toLowerCase();
    const conditionData = CONDITION_REGISTRY[id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess guard: conditions index may be undefined at runtime
    if (!conditionData) return null;
    return {
        ...conditionData,
        ...options,
        changes: options.changes ?? conditionData.changes,
        flags: foundry.utils.mergeObject(conditionData.flags, options.flags ?? {}),
        // `statuses` is what makes an ActiveEffect a STATUS in Foundry (#495): it
        // drives the token status icon and membership in `actor.statuses`. The
        // registry key IS the status id, so the two vocabularies cannot drift.
        statuses: [id],
    };
}

/**
 * The condition registry projected into `CONFIG.statusEffects` entries (#495).
 *
 * Registering these replaces Foundry's generic default status list — which has no
 * relationship to this system's conditions, their artwork, or their mechanical
 * `changes` — so the token HUD offers the real conditions and toggling one applies
 * the actual effect.
 *
 * Derived from the same registry `createConditionEffect` uses, so the HUD, the
 * effect's `changes`, and `actor.statuses` are three views of one definition
 * rather than three hand-maintained lists.
 */
export function conditionStatusEffects(): Array<{ id: string; name: string; img: string }> {
    return Object.entries(conditionRegistry()).map(([id, definition]) => ({
        id,
        name: definition.name,
        img: definition.icon,
    }));
}
