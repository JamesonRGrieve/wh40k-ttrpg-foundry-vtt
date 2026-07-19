import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';

/**
 * The runtime context a dynamic modifier hook is evaluated against — the live
 * numbers its `scale` descriptor reads. Content-agnostic: the caller assembles it
 * from the acting actor / weapon / roll, and the evaluator here is pure math over
 * it. Missing entries default to 0 so a hook that references an absent source
 * simply contributes 0 rather than throwing.
 */
export interface DynamicModifierContext {
    /** Characteristic bonus (tens digit) by key: `ws bs s t ag int per wp fel`. */
    charBonus: Readonly<Partial<Record<string, number>>>;
    /** Characteristic total by key. */
    charTotal: Readonly<Partial<Record<string, number>>>;
    /** Degrees of success on the triggering roll (drives `dos` / `degrees` scaling and the `dos` multiplier). */
    dos: number;
    /** Psy Rating. */
    pr: number;
    /** Corruption Bonus. */
    cb: number;
    /** The evaluated item's own level / rating (the `X` in "Fear (X)"). */
    level: number;
    /** Weapon penetration (for `penetration` scaling; e.g. Lance = pen × DoS). */
    penetration: number;
    /** Struck location armour points (Graviton adds these as damage). */
    armourPoints: number;
}

/**
 * The situation a hook's trigger is tested against — what kind of roll this is and
 * the state around it. All optional; an unset field reads as "not that case".
 */
export interface DynamicModifierSituation {
    isRanged?: boolean;
    isMelee?: boolean;
    /** The triggering attack inflicted Critical damage / Righteous Fury (for `onCrit`). */
    isCrit?: boolean;
    /** The triggering attack killed the target (for `onKill`). */
    isKill?: boolean;
    /** The attacker charged (for `onCharge`). */
    isCharge?: boolean;
    /** This is a Parry reaction (for `onParry`). */
    isParry?: boolean;
    /** The combat action name (for `when: onAction` / `condition: action`). */
    action?: string;
    /** The range band to the target (`point-blank | short | …`; for `atRangeBand` / `condition: rangeBand`). */
    rangeBand?: string;
    /** Tags describing the target — creature type, faction, alignment (for `vsType` / `vsFaction` / `vsAlignment`). */
    targetTags?: readonly string[];
    /** States on the acting actor — `fatigued`, `frenzied`, `aiming`, `sustained`, `braced` (for `whileState`). */
    states?: readonly string[];
    /** Ids of per-attack effects the attacker activated this roll (for `condition: activated`; e.g. `eyeOfVengeance`). */
    activated?: readonly string[];
}

/** One resolved contribution ready for the roll/damage pipeline (value or deferred dice). */
export interface DynamicComponent {
    target: DynamicModifierEntry['target'];
    targetKey: string;
    side: DynamicModifierEntry['side'];
    mode: DynamicModifierEntry['mode'];
    /** The resolved numeric magnitude (0 when the magnitude is a dice `valueFormula` the caller must roll). */
    value: number;
    /** A dice/Roll expression the caller must evaluate for the magnitude, or `''` when `value` is authoritative. */
    valueFormula: string;
    /** Display label (the hook's `label` override, else the owning item's name). */
    label: string;
    /** Provenance — the owning item's name. */
    source: string;
}

/**
 * Non-characteristic scale sources → the context field they read. The empty
 * source (`''` = unscaled) never reaches here — {@link evaluateScale} short-
 * circuits it.
 */
const FIXED_SCALE_SOURCES: Readonly<Record<string, (ctx: DynamicModifierContext) => number>> = {
    pr: (ctx) => ctx.pr,
    cb: (ctx) => ctx.cb,
    level: (ctx) => ctx.level,
    dos: (ctx) => ctx.dos,
    degrees: (ctx) => ctx.dos,
    penetration: (ctx) => ctx.penetration,
    armourPoints: (ctx) => ctx.armourPoints,
};

/** Resolve a `scale.source` to its live numeric value from the context. */
function scaleSourceValue(source: DynamicModifierEntry['scale']['source'], field: DynamicModifierEntry['scale']['field'], ctx: DynamicModifierContext): number {
    const fixed = FIXED_SCALE_SOURCES[source];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: FIXED_SCALE_SOURCES[source] may be undefined despite Record<string, …> type
    if (fixed !== undefined) return fixed(ctx);
    // A characteristic key: read the bonus (tens digit) or the total.
    return (field === 'total' ? ctx.charTotal[source] : ctx.charBonus[source]) ?? 0;
}

/** Rounding mode → the rounding function it applies. */
const SCALE_ROUNDERS: Readonly<Record<string, (n: number) => number>> = {
    up: Math.ceil,
    down: Math.floor,
    nearest: Math.round,
    none: (n) => n,
};

/** Apply the scale's rounding mode. */
function roundScaled(value: number, mode: DynamicModifierEntry['scale']['round']): number {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: SCALE_ROUNDERS[mode] may be undefined despite Record<string, …> type
    const rounder = SCALE_ROUNDERS[mode] ?? ((n: number) => n);
    return rounder(value);
}

/**
 * Evaluate a hook's `scale` descriptor to a number:
 * `source.field × factor [× multiplier]`, rounded, clamped to `[min, max]`.
 * Returns 0 when the hook is not scaled (`source === ''`).
 */
export function evaluateScale(scale: DynamicModifierEntry['scale'], ctx: DynamicModifierContext): number {
    if (scale.source === '') return 0;
    let value = scaleSourceValue(scale.source, scale.field, ctx) * scale.factor;
    if (scale.multiplier === 'dos' || scale.multiplier === 'degrees') value *= ctx.dos;
    else if (scale.multiplier === 'level') value *= ctx.level;
    value = roundScaled(value, scale.round);
    if (scale.min !== null) value = Math.max(value, scale.min);
    if (scale.max !== null) value = Math.min(value, scale.max);
    return value;
}

/**
 * Resolve a hook's numeric magnitude from the context: its `scale` descriptor when
 * scaled, else the static `value`. A dice `valueFormula` is NOT rolled here (it is
 * deferred to the caller, which owns the Roll) — {@link collectDynamicComponents}
 * surfaces the formula on the component instead.
 */
export function resolveDynamicMagnitude(hook: DynamicModifierEntry, ctx: DynamicModifierContext): number {
    if (hook.scale.source !== '') return evaluateScale(hook.scale, ctx);
    return hook.value;
}

/**
 * Convert a resolved component `value` into the **additive delta** to apply against
 * `base` for a given `mode`, so multiply/set semantics fit the additive
 * modifier-map model the damage pipeline uses:
 * - `add`      → `value` (a plain delta).
 * - `multiply` → `base × (value − 1)` (so total = base × value; Melta pen×2, Lance pen×DoS).
 * - `set`      → `value − base` (so total = value).
 * - `min`/`max`→ `null` (a clamp on a prepared stat, not a damage/pen delta — the
 *   caller skips it here; those belong to actor-prep, not the damage sum).
 */
export function modeDelta(mode: DynamicModifierEntry['mode'], base: number, value: number): number | null {
    if (mode === 'add') return value;
    if (mode === 'multiply') return base * (value - 1);
    if (mode === 'set') return value - base;
    return null;
}

/** Does the hook's `when` timing match the situation? */
function whenMatches(hook: DynamicModifierEntry, situation: DynamicModifierSituation): boolean {
    const w = hook.when;
    if (w === 'always' || w === 'onHit') return true;
    if (w === 'onCrit') return situation.isCrit === true;
    if (w === 'onKill') return situation.isKill === true;
    if (w === 'onCharge') return situation.isCharge === true;
    if (w === 'onParry') return situation.isParry === true;
    if (w === 'onAction') return hook.conditionValue === '' || situation.action === hook.conditionValue;
    // The only remaining `when` member is `atRangeBand`.
    return situation.rangeBand === hook.conditionValue;
}

/** Does the hook's `condition` predicate match the situation? */
function conditionMatches(hook: DynamicModifierEntry, situation: DynamicModifierSituation, itemSpecialization: string): boolean {
    const c = hook.condition;
    const value = hook.conditionValue;
    if (c === '') return true;
    if (c === 'melee') return situation.isMelee === true;
    if (c === 'ranged') return situation.isRanged === true;
    if (c === 'whileState') return (situation.states ?? []).includes(value);
    if (c === 'vsType' || c === 'vsFaction' || c === 'vsAlignment') return (situation.targetTags ?? []).includes(value);
    if (c === 'rangeBand') return situation.rangeBand === value;
    if (c === 'action') return situation.action === value;
    if (c === 'activated') return (situation.activated ?? []).includes(value);
    // The owning item's specialization ('Melee' / 'Ranged') must match the attack mode —
    // e.g. Deathdealer (Melee) fires only on melee attacks (Ranged only on ranged).
    if (c === 'specializationMode') {
        if (itemSpecialization === 'Melee') return situation.isMelee === true;
        if (itemSpecialization === 'Ranged') return situation.isRanged === true;
        return false;
    }
    return true;
}

/**
 * Whether a hook fires in the given situation (both its timing and predicate must
 * match). `itemSpecialization` is the owning item's `system.specialization`, read by
 * the `specializationMode` condition (default '' — no specialization).
 */
export function hookApplies(hook: DynamicModifierEntry, situation: DynamicModifierSituation, itemSpecialization = ''): boolean {
    return whenMatches(hook, situation) && conditionMatches(hook, situation, itemSpecialization);
}

/** The minimal owned-item surface the collector reads. */
export interface DynamicModifierItemLike {
    name: string | null;
    system: {
        modifiers?: { dynamicModifiers?: readonly DynamicModifierEntry[] | undefined } | undefined;
        /** The item's specialization ('Melee' / 'Ranged' / …), read by the `specializationMode` condition. */
        specialization?: string | undefined;
    };
}

/**
 * Walk a set of owned items, keep the dynamic-modifier hooks whose trigger fires in
 * `situation`, resolve each one's magnitude against `ctx`, and return the
 * provenance-bearing components for the roll / damage pipeline. Pure and
 * content-agnostic — every value comes from the hook's declared data + the live
 * context, never from a name match.
 */
export function collectDynamicComponents(
    items: Iterable<DynamicModifierItemLike>,
    ctx: DynamicModifierContext,
    situation: DynamicModifierSituation,
): DynamicComponent[] {
    const components: DynamicComponent[] = [];
    for (const item of items) {
        const hooks = item.system.modifiers?.dynamicModifiers ?? [];
        const spec = item.system.specialization;
        const specialization = typeof spec === 'string' ? spec : '';
        for (const hook of hooks) {
            if (!hookApplies(hook, situation, specialization)) continue;
            const isDice = hook.scale.source === '' && hook.valueFormula !== '';
            components.push({
                target: hook.target,
                targetKey: hook.targetKey,
                side: hook.side,
                mode: hook.mode,
                value: isDice ? 0 : resolveDynamicMagnitude(hook, ctx),
                valueFormula: isDice ? hook.valueFormula : '',
                label: hook.label !== '' ? hook.label : item.name ?? '',
                source: item.name ?? '',
            });
        }
    }
    return components;
}

/**
 * Whether any owned item declares an *activatable* dynamic-modifier hook for the
 * given per-attack effect id (a hook with `condition: 'activated'` and
 * `conditionValue: <id>`). Lets a roll surface discover "does this actor have,
 * say, Eye of Vengeance available to activate?" from the hook that carries the
 * effect, instead of name-matching the talent (`actor.hasTalent('Eye of
 * Vengeance')`) in the roll builder (Direction #7). Pure and content-agnostic —
 * the effect id is the same key the collector reads for `condition: 'activated'`.
 */
export function ownsActivatableHook(items: Iterable<DynamicModifierItemLike>, conditionValue: string): boolean {
    for (const item of items) {
        const hooks = item.system.modifiers?.dynamicModifiers ?? [];
        for (const hook of hooks) {
            if (hook.condition === 'activated' && hook.conditionValue === conditionValue) return true;
        }
    }
    return false;
}
