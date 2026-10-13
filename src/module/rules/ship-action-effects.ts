/**
 * Rogue Trader starship action effects (RT Core pp.212–218, #186, #189).
 *
 * A ship action's printed effect is authored as DATA on its `order` item — the
 * optional `shipEffect` block — never named in code. This module holds the
 * content-agnostic primitives that evaluate such a block:
 *
 *   • the action's test, composed as a full derivation (the acting
 *     character's skill, plus the ship's Manoeuvrability or Detection for a
 *     Combined Skill Test, p.212, plus the printed difficulty and any
 *     situational modifier), every term a provenance-bearing component;
 *   • the effect's magnitude, `base + step × ⌊extra degrees ÷ per⌋`, again as
 *     components so the card can show how it was reached;
 *   • the ActiveEffect a timed ship modifier is stored as, and the collector
 *     that turns a ship's live modifier effects back into named rows on any
 *     later test they touch (the BS test to fire a Weapon Component, the
 *     Manoeuvrability / Detection term of a combined test).
 *
 * Pure module: no Foundry, no RNG. Callers roll the dice and read the actor.
 */

import { situationalComponents, deriveTarget, type ShipTestComponent, type ShipTestDerivation, type SituationalModifier } from './ship-assault.ts';
import type { PriorTurnPool } from './ship-crew-morale.ts';

/** What an order's `shipEffect` does on a success. `''` = no automated effect (a rules card only). */
export const SHIP_EFFECT_KINDS = ['reducePriorTurnDamage', 'shipModifier'] as const;
export type ShipEffectKind = (typeof SHIP_EFFECT_KINDS)[number];

/** The prior-turn damage pools a `reducePriorTurnDamage` effect can target (Hold Fast!, Triage). */
const SHIP_EFFECT_POOL_TARGETS = ['morale', 'crewPopulation'] as const satisfies readonly PriorTurnPool[];

/** Ship stats a timed modifier changes directly (an ActiveEffect `ADD` change on `system.<stat>`). */
const SHIP_EFFECT_STAT_TARGETS = ['speed', 'manoeuvrability', 'detection'] as const;
type ShipEffectStatTarget = (typeof SHIP_EFFECT_STAT_TARGETS)[number];

/**
 * Ballistic Skill targets of a timed modifier: one chosen Weapon Component
 * (`weaponBallisticSkill`, Lock on Target) or every BS test to fire the ship's
 * weapons (`ballisticSkill`, Come to New Heading, Evasive Manoeuvres).
 */
const SHIP_EFFECT_BS_TARGETS = ['weaponBallisticSkill', 'ballisticSkill'] as const;
type ShipEffectBsTarget = (typeof SHIP_EFFECT_BS_TARGETS)[number];

/** Every target a `shipModifier` effect can name. */
export type ShipModifierTarget = ShipEffectStatTarget | ShipEffectBsTarget;

/** Every target an order's `shipEffect.targets` may list. */
export const SHIP_EFFECT_TARGETS = [...SHIP_EFFECT_POOL_TARGETS, ...SHIP_EFFECT_STAT_TARGETS, ...SHIP_EFFECT_BS_TARGETS] as const;

/**
 * When a timed modifier lapses, as a V14 ActiveEffect expiry event: `turnEnd`
 * with 0 rounds is "during this turn"; `turnStart` with 1 round is "until the
 * beginning of its next Turn".
 */
export const SHIP_EFFECT_EXPIRIES = ['turnEnd', 'turnStart'] as const;
type ShipEffectExpiry = (typeof SHIP_EFFECT_EXPIRIES)[number];

/** The ship stat a Combined Skill Test adds to the character's skill (RT Core p.212). */
export const SHIP_TEST_STATS = ['manoeuvrability', 'detection'] as const;
export type ShipTestStat = (typeof SHIP_TEST_STATS)[number];

/** The schema-cleaned `shipEffect` block of an `order` item. */
export interface ShipEffectData {
    kind: ShipEffectKind | '';
    /** One target, or several the acting character chooses between (Aid the Machine Spirit). */
    targets: string[];
    /** Magnitude on a bare success. */
    base: number;
    /** Added per `per` extra degrees of success. */
    step: number;
    per: number;
    /** Rounds the modifier lasts past the current one (0 = this turn). */
    rounds: number;
    expiry: ShipEffectExpiry | '';
}

/** Narrow a string to one of a literal tuple's members. */
function isMember<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}

export function isShipEffectKind(value: string): value is ShipEffectKind {
    return isMember(SHIP_EFFECT_KINDS, value);
}

export function isPoolTarget(value: string): value is PriorTurnPool {
    return isMember(SHIP_EFFECT_POOL_TARGETS, value);
}

export function isModifierTarget(value: string): value is ShipModifierTarget {
    return isMember(SHIP_EFFECT_STAT_TARGETS, value) || isMember(SHIP_EFFECT_BS_TARGETS, value);
}

function isStatTarget(value: string): value is ShipEffectStatTarget {
    return isMember(SHIP_EFFECT_STAT_TARGETS, value);
}

export function isShipTestStat(value: string): value is ShipTestStat {
    return isMember(SHIP_TEST_STATS, value);
}

/** Does this order roll its test and apply an automated effect? */
export function hasShipEffect(effect: ShipEffectData | undefined): effect is ShipEffectData & { kind: ShipEffectKind } {
    return effect !== undefined && isShipEffectKind(effect.kind) && effect.targets.length > 0;
}

/** The targets of an effect that its kind accepts, in authored order. */
export function effectTargets(effect: ShipEffectData): string[] {
    return effect.targets.filter((target) => (effect.kind === 'reducePriorTurnDamage' ? isPoolTarget(target) : isModifierTarget(target)));
}

/**
 * Extra degrees of success beyond a bare success, the count RT effects scale
 * with ("every degree of success", "every two additional degrees"). RT counts
 * each full 10 points of margin (`gen1`, RT Core p.231), so a bare success is
 * 0; the `gen2` world-setting override uses the tens-digit difference. Always
 * 0 on a failure.
 */
export function extraDegreesOfSuccess(method: 'gen1' | 'gen2', roll: number, target: number, success: boolean): number {
    if (!success) return 0;
    const extra = method === 'gen1' ? Math.floor((target - roll) / 10) : Math.floor(target / 10) - Math.floor(roll / 10);
    return Math.max(0, extra);
}

/** Langpack keys naming the terms of an effect's magnitude. */
const MAGNITUDE_BASE_KEY = 'WH40K.Voidcraft.ShipAction.Magnitude.Base';
const MAGNITUDE_DEGREES_KEY = 'WH40K.Voidcraft.ShipAction.Magnitude.Degrees';

/**
 * The terms of an effect's magnitude: the bare-success `base`, plus `step`
 * for every `per` extra degrees. A zero degree term is omitted.
 */
export function shipEffectMagnitudeComponents(effect: ShipEffectData, extraDegrees: number): ShipTestComponent[] {
    const per = Math.max(1, Math.trunc(effect.per));
    const steps = Math.floor(Math.max(0, extraDegrees) / per);
    const components: ShipTestComponent[] = [{ labelKey: MAGNITUDE_BASE_KEY, value: effect.base }];
    if (steps > 0 && effect.step !== 0) {
        components.push({ labelKey: MAGNITUDE_DEGREES_KEY, value: effect.step * steps, data: { degrees: extraDegrees, per, step: effect.step } });
    }
    return components;
}

/** `base + step × ⌊extra degrees ÷ per⌋`. */
export function shipEffectMagnitude(effect: ShipEffectData, extraDegrees: number): number {
    return shipEffectMagnitudeComponents(effect, extraDegrees).reduce((total, component) => total + component.value, 0);
}

/* -------------------------------------------- */
/*  Timed ship modifiers (ActiveEffects)        */
/* -------------------------------------------- */

/** Flag scope / key a ship-action modifier effect carries its structured payload under. */
export const SHIP_MODIFIER_FLAG_SCOPE = 'wh40k-rpg';
export const SHIP_MODIFIER_FLAG_KEY = 'shipActionModifier';

/** The structured payload a ship-action modifier effect carries. */
export interface ShipModifierFlag {
    target: ShipModifierTarget;
    value: number;
    /** The chosen Weapon Component for `weaponBallisticSkill`; empty otherwise. */
    weaponId: string;
}

/** A timed modifier to create on the ship. */
export interface ShipModifierInput extends ShipModifierFlag {
    /** The action's name — the effect's name and the row label wherever it applies. */
    name: string;
    img: string;
    /** The action's item UUID, recorded as the effect's origin. */
    origin: string;
    rounds: number;
    expiry: ShipEffectExpiry;
}

/** One `changes` entry of the effect. */
interface ShipModifierChange {
    key: string;
    mode: number;
    value: string;
}

/** The ActiveEffect create payload for a timed ship modifier. */
export interface ShipModifierEffectSource {
    name: string;
    img: string;
    origin: string;
    changes: ShipModifierChange[];
    duration: { value: number; units: 'rounds'; expiry: ShipEffectExpiry };
    flags: { [SHIP_MODIFIER_FLAG_SCOPE]: { [SHIP_MODIFIER_FLAG_KEY]: ShipModifierFlag } };
}

/**
 * Build the ActiveEffect a timed ship modifier is stored as. A stat target
 * (Speed, Manoeuvrability, Detection) is an `ADD` change on `system.<stat>`,
 * so the sheet and every later read see it; a Ballistic Skill target has no
 * `changes` — the ship's BS test reads it through {@link collectShipModifierComponents}.
 * `addMode` is `CONST.ACTIVE_EFFECT_MODES.ADD`, passed in to keep this module Foundry-free.
 */
export function shipModifierEffectSource(input: ShipModifierInput, addMode: number): ShipModifierEffectSource {
    return {
        name: input.name,
        img: input.img,
        origin: input.origin,
        changes: isStatTarget(input.target) ? [{ key: `system.${input.target}`, mode: addMode, value: String(input.value) }] : [],
        duration: { value: Math.max(0, Math.trunc(input.rounds)), units: 'rounds', expiry: input.expiry },
        flags: { [SHIP_MODIFIER_FLAG_SCOPE]: { [SHIP_MODIFIER_FLAG_KEY]: { target: input.target, value: input.value, weaponId: input.weaponId } } },
    };
}

/**
 * Validate a stored flag value as a {@link ShipModifierFlag}; null for any
 * other shape (an effect that is not a ship-action modifier).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: a stored ActiveEffect flag value (Foundry's untyped flag bag), type-guarded on the next lines
export function readShipModifierFlag(value: unknown): ShipModifierFlag | null {
    if (value === null || typeof value !== 'object') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: the stored flag object, each member type-guarded on the next line
    const { target, value: amount, weaponId } = value as Partial<Record<keyof ShipModifierFlag, unknown>>;
    if (typeof target !== 'string' || !isModifierTarget(target) || typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    return { target, value: amount, weaponId: typeof weaponId === 'string' ? weaponId : '' };
}

/** A ship's ActiveEffect as the collector reads it. */
export interface ShipEffectView {
    name: string;
    /** Foundry's `ActiveEffect#active`: not disabled, not suppressed or expired. */
    active: boolean;
    modifier: ShipModifierFlag | null;
}

/** Langpack key of a ship-action modifier row on a later test. */
export const SHIP_MODIFIER_COMPONENT_KEY = 'WH40K.Voidcraft.ShipAction.Component.Effect';

/** What a later test asks the collector for. */
export type ShipModifierQuery = { target: 'ballisticSkill'; weaponId: string } | { target: ShipTestStat };

function modifierApplies(modifier: ShipModifierFlag, query: ShipModifierQuery): boolean {
    if (query.target === 'ballisticSkill') {
        return modifier.target === 'ballisticSkill' || (modifier.target === 'weaponBallisticSkill' && modifier.weaponId === query.weaponId);
    }
    return modifier.target === query.target;
}

/**
 * The central collector for ship-action modifiers: every live modifier effect
 * on the ship that touches the queried test, as one named row each (the
 * action's name and value). Lock on Target's bonus reaches only the chosen
 * Weapon Component's BS test; Come to New Heading's and Evasive Manoeuvres'
 * penalties reach every one.
 */
export function collectShipModifierComponents(effects: Iterable<ShipEffectView>, query: ShipModifierQuery): ShipTestComponent[] {
    const rows: ShipTestComponent[] = [];
    for (const effect of effects) {
        if (!effect.active || effect.modifier === null || effect.modifier.value === 0) continue;
        if (!modifierApplies(effect.modifier, query)) continue;
        rows.push({ labelKey: SHIP_MODIFIER_COMPONENT_KEY, value: effect.modifier.value, data: { name: effect.name } });
    }
    return rows;
}

/* -------------------------------------------- */
/*  The action's test                           */
/* -------------------------------------------- */

/** Langpack keys of the test's terms. */
const ACTION_SKILL_KEY = 'WH40K.Voidcraft.ShipAction.Component.Skill';
const ACTION_DIFFICULTY_KEY = 'WH40K.Voidcraft.ShipAction.Component.Difficulty';
const SHIP_STAT_KEYS: Readonly<Record<ShipTestStat, string>> = {
    manoeuvrability: 'WH40K.Voidcraft.ShipAction.Component.Manoeuvrability',
    detection: 'WH40K.Voidcraft.ShipAction.Component.Detection',
};

/** The ship stat a Combined Skill Test adds, with the live modifiers already inside it. */
interface ShipTestStatInput {
    stat: ShipTestStat;
    /** The ship's current value, ActiveEffect changes included. */
    value: number;
    /** The ship-action modifier rows already counted in `value` (see {@link collectShipModifierComponents}). */
    modifiers: readonly ShipTestComponent[];
}

export interface ShipActionTestInput {
    /** What the character tests, as printed ("Tech-Use", "Willpower"). */
    skillLabel: string;
    /** The acting character's skill / characteristic target. */
    skill: number;
    ship: string;
    /** The printed difficulty (Difficult −10 …). */
    difficulty: number;
    shipStat: ShipTestStatInput | null;
    situational?: SituationalModifier;
}

/**
 * Compose an action's test: the character's skill, then — for a Combined
 * Skill Test — the ship's stat split into its unmodified value and each live
 * ship-action modifier inside it, then the printed difficulty and any
 * situational modifier.
 */
export function composeShipActionTest(input: ShipActionTestInput): ShipTestDerivation {
    const components: ShipTestComponent[] = [];
    if (input.shipStat !== null) {
        const counted = input.shipStat.modifiers.reduce((total, row) => total + row.value, 0);
        components.push({ labelKey: SHIP_STAT_KEYS[input.shipStat.stat], value: input.shipStat.value - counted, data: { ship: input.ship } });
        components.push(...input.shipStat.modifiers);
    }
    if (input.difficulty !== 0) components.push({ labelKey: ACTION_DIFFICULTY_KEY, value: input.difficulty });
    components.push(...situationalComponents(input.situational));
    return deriveTarget({ labelKey: ACTION_SKILL_KEY, value: input.skill, data: { skill: input.skillLabel } }, components);
}
