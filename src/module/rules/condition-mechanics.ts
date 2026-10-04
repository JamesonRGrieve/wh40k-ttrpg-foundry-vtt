/**
 * Condition mechanics — the content-agnostic VOCABULARY and pure resolvers for
 * the structured behaviour a condition document declares (Direction #7).
 *
 * The VALUES live on the condition compendium documents (`type: condition`,
 * `system.targeted` / `helplessTarget` / `actionLimit` / `autoFail` / `tick`, see
 * `data/item/condition.ts`). Nothing here names a condition: a consumer reads the
 * bearer's active {@link ConditionMechanics} and asks a question of the DATA —
 * "does anything make attacks against this bearer auto-hit?", "what is the most
 * restrictive action limit?", "does any condition auto-fail this test?".
 *
 * A LEAF: no Foundry globals at import time and no imports beyond the pure
 * characteristic-key table, so the DataModel schema, the roll pipeline, the
 * action economy and the unit tests can all share the one vocabulary.
 */

import { normalizeCharacteristicKey } from '../data/shared/characteristics.ts';

/** Which attacks against the bearer a {@link TargetedConditionEntry} applies to. */
export const TARGETED_ATTACK_KINDS = ['melee', 'ranged', 'any'] as const;
type TargetedAttackKind = (typeof TARGETED_ATTACK_KINDS)[number];

/**
 * What the bearer may do on its turn. Ordered from least to most restrictive in
 * {@link ACTION_LIMIT_SEVERITY}; when several conditions declare a limit, the most
 * restrictive one governs.
 */
export const ACTION_LIMITS = ['none', 'noActions', 'halfActionOnly', 'grappleOnly', 'loseTurn'] as const;
export type ActionLimit = (typeof ACTION_LIMITS)[number];

/** When a condition's per-interval effect fires. `''` = the condition has no tick. */
export const TICK_INTERVALS = ['', 'round', 'turn', 'minute'] as const;
export type TickInterval = (typeof TICK_INTERVALS)[number];

/** A modifier applied to OTHERS attacking the bearer (Prone, Stunned, Unaware, …). */
export type TargetedConditionEntry = {
    attack: TargetedAttackKind;
    value: number;
    /**
     * A range-band id (as `rules/range.ts` brackets it — `pointBlank`, `short`, …;
     * any spelling that slugs to the same band) at which this entry does NOT
     * apply. `''` = applies at every range.
     */
    exceptRange: string;
    /** Display label; `''` falls back to the condition's own name. */
    label: string;
};

/** The test a tick demands of the bearer. */
export type ConditionTickTest = {
    /** Full characteristic key (`willpower`, `toughness`, …). */
    characteristic: string;
    /** Difficulty modifier added to the characteristic total (Challenging = 0, Hard = −20). */
    difficulty: number;
};

/** A condition's per-interval effect. */
export type ConditionTick = {
    interval: TickInterval;
    /** Dice formula rolled each interval; `''` = no damage. */
    damage: string;
    damageType: string;
    ignoresArmour: boolean;
    /** Fatigue levels gained each interval. */
    fatigue: number;
    test: ConditionTickTest | null;
    /** Condition identifier applied when the tick's test fails; `''` = none. */
    onFail: string;
};

/** Everything a condition declares beyond its static modifiers, resolved for one line. */
export interface ConditionMechanics {
    /** The condition's status id (`system.identifier`). */
    identifier: string;
    /** Display name — the provenance label on cards. */
    name: string;
    targeted: TargetedConditionEntry[];
    helplessTarget: boolean;
    actionLimit: ActionLimit;
    /** Characteristic keys and test-variant names the bearer automatically fails. */
    autoFail: string[];
    tick: ConditionTick;
    /** The condition's removal text (HTML), surfaced on tick cards. */
    removal: string;
}

/** A tick that does nothing — the schema's initial value. */
export const EMPTY_TICK: ConditionTick = Object.freeze({
    interval: '',
    damage: '',
    damageType: '',
    ignoresArmour: false,
    fatigue: 0,
    test: null,
    onFail: '',
});

/* -------------------------------------------- */
/*  Coercion (raw pack / item data → mechanics)  */
/* -------------------------------------------- */

/** A raw, not-yet-validated JSON value (pack index payload / item system). */
export type RawValue = string | number | boolean | null | undefined | RawRecord | readonly RawValue[];
/** A raw, not-yet-validated JSON object. */
export type RawRecord = { readonly [key: string]: RawValue };

function isRecord(value: RawValue): value is RawRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: RawValue): string {
    return typeof value === 'string' ? value : '';
}

function asNumber(value: RawValue): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

function asArray(value: RawValue): readonly RawValue[] {
    if (value === null || value === undefined || typeof value !== 'object' || isRecord(value)) return [];
    return value;
}

function includesLiteral<T extends string>(list: readonly T[], value: string): value is T {
    return (list as readonly string[]).includes(value);
}

function coerceTargeted(raw: RawValue): TargetedConditionEntry[] {
    const entries: TargetedConditionEntry[] = [];
    for (const item of asArray(raw)) {
        if (!isRecord(item)) continue;
        const attack = asString(item['attack']);
        const value = asNumber(item['value']);
        if (!includesLiteral(TARGETED_ATTACK_KINDS, attack) || value === 0) continue;
        entries.push({ attack, value, exceptRange: asString(item['exceptRange']).trim(), label: asString(item['label']).trim() });
    }
    return entries;
}

function coerceTickTest(raw: RawValue): ConditionTickTest | null {
    if (!isRecord(raw)) return null;
    const characteristic = asString(raw['characteristic']).trim();
    if (characteristic === '') return null;
    return { characteristic, difficulty: asNumber(raw['difficulty']) };
}

function coerceTick(raw: RawValue): ConditionTick {
    if (!isRecord(raw)) return { ...EMPTY_TICK };
    const interval = asString(raw['interval']);
    return {
        interval: includesLiteral(TICK_INTERVALS, interval) ? interval : '',
        damage: asString(raw['damage']).trim(),
        damageType: asString(raw['damageType']).trim(),
        ignoresArmour: raw['ignoresArmour'] === true,
        fatigue: Math.max(0, Math.trunc(asNumber(raw['fatigue']))),
        test: coerceTickTest(raw['test']),
        onFail: asString(raw['onFail']).trim(),
    };
}

/**
 * The condition fields {@link coerceConditionMechanics} reads. Satisfied both by a
 * raw pack-index payload ({@link RawRecord}) and by the condition DataModel.
 */
export type ConditionMechanicsInput = {
    readonly targeted?: RawValue;
    readonly helplessTarget?: RawValue;
    readonly actionLimit?: RawValue;
    readonly autoFail?: RawValue;
    readonly tick?: RawValue;
    readonly removal?: RawValue;
};

/**
 * Validate a condition's line-resolved `system` payload into {@link ConditionMechanics}.
 * Unknown / malformed entries are dropped, never coerced into behaviour: an
 * unrecognised `actionLimit` is `none`, a targeted entry with an unknown `attack`
 * or a zero value contributes nothing.
 * @param {string} identifier  The condition's status id.
 * @param {string} name        Display name.
 * @param {object} system      The condition's system payload, already collapsed to one line.
 * @returns {ConditionMechanics}  The validated mechanics.
 */
export function coerceConditionMechanics(identifier: string, name: string, system: ConditionMechanicsInput): ConditionMechanics {
    const actionLimit = asString(system.actionLimit);
    const autoFail = asArray(system.autoFail)
        .map((entry) => asString(entry).trim())
        .filter((entry) => entry !== '');
    return {
        identifier,
        name,
        targeted: coerceTargeted(system.targeted),
        helplessTarget: system.helplessTarget === true,
        actionLimit: includesLiteral(ACTION_LIMITS, actionLimit) ? actionLimit : 'none',
        autoFail,
        tick: coerceTick(system.tick),
        removal: asString(system.removal),
    };
}

/**
 * De-duplicate mechanics by identifier, first occurrence wins. A bearer carrying
 * the same condition twice (a status effect AND an owned condition item) must not
 * double its targeted modifiers or tick twice.
 */
export function uniqueConditionMechanics(mechanics: Iterable<ConditionMechanics>): ConditionMechanics[] {
    const seen = new Set<string>();
    const out: ConditionMechanics[] = [];
    for (const entry of mechanics) {
        if (seen.has(entry.identifier)) continue;
        seen.add(entry.identifier);
        out.push(entry);
    }
    return out;
}

/* -------------------------------------------- */
/*  Resolvers                                   */
/* -------------------------------------------- */

/** The conditions that make attacks against their bearer auto-hit. */
export function helplessTargetConditions(mechanics: readonly ConditionMechanics[]): ConditionMechanics[] {
    return mechanics.filter((entry) => entry.helplessTarget);
}

/**
 * The target conditions that make THIS attack hit automatically. Every line
 * prints the helpless auto-hit for Weapon Skill tests only, so a ranged attack
 * against a helpless bearer is rolled normally.
 * @param {readonly ConditionMechanics[]} targetMechanics  The target's active conditions.
 * @param {boolean} isMeleeAttack  Whether the attack is a melee (Weapon Skill) attack.
 * @returns {ConditionMechanics[]}  The conditions granting the auto-hit (empty = roll normally).
 */
export function helplessAutoHitConditions(targetMechanics: readonly ConditionMechanics[], isMeleeAttack: boolean): ConditionMechanics[] {
    return isMeleeAttack ? helplessTargetConditions(targetMechanics) : [];
}

/** Severity rank per limit; the highest governs. */
const ACTION_LIMIT_SEVERITY: Readonly<Record<ActionLimit, number>> = {
    none: 0,
    grappleOnly: 1,
    halfActionOnly: 2,
    loseTurn: 3,
    noActions: 4,
};

/** The governing action limit and the condition that imposes it (null when unrestricted). */
interface ResolvedActionLimit {
    limit: ActionLimit;
    source: ConditionMechanics | null;
}

/**
 * Resolve the bearer's governing action limit — the most restrictive one any
 * active condition declares.
 * @param {readonly ConditionMechanics[]} mechanics  The bearer's active conditions.
 * @returns {ResolvedActionLimit}  The limit plus the condition imposing it.
 */
export function resolveActionLimit(mechanics: readonly ConditionMechanics[]): ResolvedActionLimit {
    let best: ResolvedActionLimit = { limit: 'none', source: null };
    for (const entry of mechanics) {
        if (ACTION_LIMIT_SEVERITY[entry.actionLimit] > ACTION_LIMIT_SEVERITY[best.limit]) {
            best = { limit: entry.actionLimit, source: entry };
        }
    }
    return best;
}

/** The test whose automatic failure is being checked. */
interface AutoFailTest {
    /** Full characteristic key the test is made against (`ballisticSkill`), or null for a skill test. */
    characteristic: string | null;
    /** Selected test-variant name (`Visual`, `Auditory`), or null when none. */
    variant: string | null;
}

/** The roll fields {@link rolledCharacteristic} reads (a `RollData` satisfies it). */
type RolledTestShape = {
    /** Roll category: `Characteristic`, `Skill`, or an attack / power category. */
    type: string;
    /** The rolled stat key for a characteristic / skill test. */
    rollKey: string;
    /** The characteristic an attack / power test is made against (`WS`, `BS`, …). */
    baseChar: string;
};

/**
 * The full characteristic key a test is made against, for `autoFail` matching —
 * the rolled characteristic for a Characteristic test, the attack's base
 * characteristic (`WS` / `BS`) for an attack, and null for a Skill test (a skill
 * test is not a test of its governing characteristic).
 * @param {RolledTestShape} roll  The roll.
 * @returns {string | null}  The full characteristic key.
 */
export function rolledCharacteristic(roll: RolledTestShape): string | null {
    if (roll.type === 'Skill') return null;
    return normalizeCharacteristicKey(roll.type === 'Characteristic' ? roll.rollKey : roll.baseChar);
}

/**
 * The conditions that automatically fail a test. An `autoFail` entry matches the
 * test's characteristic key or its selected variant name, case-insensitively.
 * @param {readonly ConditionMechanics[]} mechanics  The tester's active conditions.
 * @param {AutoFailTest} check  The test being made.
 * @returns {ConditionMechanics[]}  Every condition forcing the failure (empty = the test stands).
 */
export function autoFailingConditions(mechanics: readonly ConditionMechanics[], check: AutoFailTest): ConditionMechanics[] {
    const wanted = new Set<string>();
    if (check.characteristic !== null && check.characteristic !== '') wanted.add(check.characteristic.toLowerCase());
    if (check.variant !== null && check.variant !== '') wanted.add(check.variant.toLowerCase());
    if (wanted.size === 0) return [];
    return mechanics.filter((entry) => entry.autoFail.some((name) => wanted.has(name.toLowerCase())));
}
