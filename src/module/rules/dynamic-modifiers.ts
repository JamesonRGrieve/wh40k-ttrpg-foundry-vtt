import type { DynamicModifierEntry, GrantedEffectEntry, GrantEffectKind } from '../data/shared/modifiers-template.ts';
import { normalizeTag, TARGET_TAG_AXES, type TargetTagAxis, type TargetTagsByAxis } from './situation-tags.ts';

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

/** Short characteristic key → the fuzzy name `getCharacteristicFuzzy` resolves. */
const CHARACTERISTIC_FUZZY: Readonly<Record<string, string>> = {
    ws: 'WeaponSkill',
    bs: 'BallisticSkill',
    s: 'Strength',
    t: 'Toughness',
    ag: 'Agility',
    int: 'Intelligence',
    per: 'Perception',
    wp: 'Willpower',
    fel: 'Fellowship',
};

/**
 * The read-surface {@link buildCharBonus} needs — structural, so this module stays
 * Foundry-free. The lookup returns `undefined` for a characteristic the actor does
 * not have (a vehicle has no Fellowship), which is why the builder guards it.
 */
export interface CharacteristicSource {
    getCharacteristicFuzzy: (fuzzy: string) => { bonus: number; effectiveBonus?: number | undefined } | undefined;
}

/**
 * Build the `charBonus` half of a {@link DynamicModifierContext} from an actor.
 *
 * Shared by every collector so the key set is defined once: a hook scaling by
 * `sb` must mean the same characteristic on the attack channel as on the damage
 * channel. Uses the EFFECTIVE bonus, so hooks that scale by a characteristic
 * (Crushing Blow ½SB, Mighty Shot ½BS) reflect fatigue / traits / drugs (#415).
 * @param {CharacteristicSource} actor  The acting actor.
 * @returns {Record<string, number>}  Bonus by short characteristic key.
 */
export function buildCharBonus(actor: CharacteristicSource): Record<string, number> {
    const charBonus: Record<string, number> = {};
    for (const [short, fuzzy] of Object.entries(CHARACTERISTIC_FUZZY)) {
        const char = actor.getCharacteristicFuzzy(fuzzy);
        // Absent characteristic contributes 0 rather than throwing, matching the
        // context's documented "missing entries default to 0" contract.
        charBonus[short] = char === undefined ? 0 : char.effectiveBonus ?? char.bonus;
    }
    return charBonus;
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
    /**
     * The range band to the target (`point-blank | short | …`; for `atRangeBand` /
     * `condition: rangeBand`). Built by `rangeBandOf` from the roll's computed
     * bracket; `undefined` means the roll never computed one, which is NOT the
     * same as "the band did not match" — see {@link findInertTriggers}.
     */
    rangeBand?: string | undefined;
    /**
     * Tags describing the target — creature type, faction, alignment (for
     * `vsType` / `vsFaction` / `vsAlignment`). Built by `collectTargetTags`.
     */
    targetTags?: readonly string[];
    /**
     * The same target tags grouped by the axis that produced them, carried
     * alongside the flat {@link targetTags} purely so an axis that contributed
     * NOTHING is distinguishable from one whose tags simply did not match.
     * Without it a `vsFaction` hook against a factionless target is
     * indistinguishable from a working hook aimed at the wrong enemy.
     */
    targetTagAxes?: TargetTagsByAxis | undefined;
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

/**
 * The trigger fields shared by a numeric hook ({@link DynamicModifierEntry}) and a
 * conditional grant ({@link GrantedEffectEntry}) — the `when` timing plus
 * the `condition`/`conditionValue` predicate. Extracted so both channels reuse the
 * one trigger-matching implementation instead of duplicating it.
 */
export type DynamicTrigger = Pick<DynamicModifierEntry, 'when' | 'condition' | 'conditionValue'>;

/** Does the trigger's `when` timing match the situation? */
function whenMatches(trigger: DynamicTrigger, situation: DynamicModifierSituation): boolean {
    const w = trigger.when;
    if (w === 'always' || w === 'onHit') return true;
    if (w === 'onCrit') return situation.isCrit === true;
    if (w === 'onKill') return situation.isKill === true;
    if (w === 'onCharge') return situation.isCharge === true;
    if (w === 'onParry') return situation.isParry === true;
    if (w === 'onAction') return trigger.conditionValue === '' || situation.action === trigger.conditionValue;
    // The only remaining `when` member is `atRangeBand`.
    return situation.rangeBand === normalizeTag(trigger.conditionValue);
}

/** Is `condition` one of the three target-tag axes? */
function isTargetTagAxis(condition: string): condition is TargetTagAxis {
    return (TARGET_TAG_AXES as readonly string[]).includes(condition);
}

/**
 * Does the target carry `value` on the `axis` the condition names?
 *
 * Both sides are slugged, so an authored `Daemonic` / `daemonic` / `DAEMONIC`
 * meets the derived tag in one spelling.
 *
 * The axis is honoured when the situation supplies the per-axis grouping: a
 * `vsType` hook must match something the target IS, never the organisation it
 * belongs to, or `vsType: 'Blood Pact'` would fire on every axis at once. A
 * situation carrying only the flat {@link DynamicModifierSituation.targetTags}
 * falls back to it — the field is the declared, documented surface, and a caller
 * that hands over a plain tag list still gets a working predicate.
 */
function targetTagMatches(axis: TargetTagAxis, value: string, situation: DynamicModifierSituation): boolean {
    const tag = normalizeTag(value);
    const scoped = situation.targetTagAxes?.[axis];
    if (scoped !== undefined) return scoped.includes(tag);
    return (situation.targetTags ?? []).includes(tag);
}

/** Does the trigger's `condition` predicate match the situation? */
function conditionMatches(trigger: DynamicTrigger, situation: DynamicModifierSituation, itemSpecialization: string): boolean {
    const c = trigger.condition;
    const value = trigger.conditionValue;
    if (c === '') return true;
    if (c === 'melee') return situation.isMelee === true;
    if (c === 'ranged') return situation.isRanged === true;
    if (c === 'whileState') return (situation.states ?? []).includes(normalizeTag(value));
    if (isTargetTagAxis(c)) return targetTagMatches(c, value, situation);
    if (c === 'rangeBand') return situation.rangeBand === normalizeTag(value);
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
export function hookApplies(hook: DynamicTrigger, situation: DynamicModifierSituation, itemSpecialization = ''): boolean {
    return whenMatches(hook, situation) && conditionMatches(hook, situation, itemSpecialization);
}

/**
 * One authored trigger the situation is structurally incapable of ever matching
 * — the hook is not "not applying right now", it CANNOT apply at all.
 */
export interface InertTrigger {
    /** The owning item's name (provenance). */
    source: string;
    /** The trigger field that can never be satisfied (`vsType`, `whileState`, `rangeBand`, `atRangeBand`). */
    condition: string;
    /** The value the trigger tests for. */
    value: string;
}

/**
 * Whether the situation can never satisfy this trigger, whatever the authored
 * value is — because the input the trigger reads was never supplied.
 *
 * This is the distinction that let #518 hide: a `vsType` hook that does not fire
 * because the target is an Ork looks exactly like one that does not fire because
 * nothing ever populated `targetTags`. The first is correct play, the second is
 * a broken engine. An axis with zero tags means no value on it could match, so
 * an empty axis counts as "never supplied" alongside a missing one.
 */
function triggerIsInert(trigger: DynamicTrigger, situation: DynamicModifierSituation): boolean {
    const c = trigger.condition;
    if (isTargetTagAxis(c)) {
        const axis = situation.targetTagAxes?.[c];
        return axis === undefined || axis.length === 0;
    }
    if (c === 'whileState') return situation.states === undefined;
    if (c === 'rangeBand' || trigger.when === 'atRangeBand') return situation.rangeBand === undefined;
    return false;
}

/** The trigger field to report for an inert hook — its condition, else its timing. */
function inertTriggerField(trigger: DynamicTrigger): string {
    return trigger.condition !== '' ? trigger.condition : trigger.when;
}

/**
 * Walk a set of owned items and return every authored trigger the ATTACK-path
 * situation can never satisfy, de-duplicated and order-stable. Pure: the caller
 * decides how to surface them (the damage pipeline raises a GM notification).
 *
 * Scanning grants as well as numeric hooks matters — a conditional grant is gated
 * by the exact same trigger primitives, so it goes inert the same way.
 *
 * Defender-side numeric hooks are skipped: they are evaluated during damage
 * ASSIGNMENT against a different, deliberately narrower situation, so judging
 * them from the attack path would report a false positive on every actor that
 * carries one. Grants have no side — they always modify the attack.
 */
export function findInertTriggers(items: Iterable<DynamicModifierItemLike>, situation: DynamicModifierSituation): InertTrigger[] {
    const out: InertTrigger[] = [];
    const seen = new Set<string>();
    const record = (item: DynamicModifierItemLike, trigger: DynamicTrigger): void => {
        if (!triggerIsInert(trigger, situation)) return;
        const entry: InertTrigger = { source: item.name ?? '', condition: inertTriggerField(trigger), value: trigger.conditionValue };
        const key = `${entry.source}|${entry.condition}|${entry.value}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(entry);
    };
    for (const item of items) {
        const mods = item.system.modifiers;
        for (const hook of mods?.dynamicModifiers ?? []) {
            if (hook.side === 'defender') continue;
            record(item, hook);
        }
        for (const grant of mods?.grantedEffects ?? []) record(item, grant);
    }
    return out;
}

/** The minimal owned-item surface the collectors read. */
export interface DynamicModifierItemLike {
    name: string | null;
    system: {
        modifiers?:
            | {
                  dynamicModifiers?: readonly DynamicModifierEntry[] | undefined;
                  grantedEffects?: readonly GrantedEffectEntry[] | undefined;
              }
            | undefined;
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

/** Something an item's conditional grant confers, with provenance. */
export interface GrantedEffect {
    /** What sort of thing is granted (`quality`, `talent`, …). */
    kind: GrantEffectKind;
    /** The granted thing's display name. */
    name: string;
    /** Compendium UUID of the granted document; blank for `quality` grants. */
    uuid: string;
    /** The grant's `(X)` level; 0 for unlevelled grants. */
    level: number;
    /** The granting item's name (provenance). */
    source: string;
}

/** A weapon quality an item's grant contributes to an attack, with provenance. */
export type GrantedQuality = Omit<GrantedEffect, 'kind' | 'uuid'>;

/**
 * Walk a set of owned items and return every conditional grant whose trigger fires
 * in `situation` — the non-numeric counterpart to {@link collectDynamicComponents}.
 * Lets the engine confer a quality/talent/trait/… (e.g. Hammer Blow → Concussive (2)
 * / Shocking on an All-Out Attack) from the item's declared `grantedEffects` data
 * rather than a name match. Pure and content-agnostic; each line authors its own
 * grant (§D8).
 */
export function collectGrantedEffects(items: Iterable<DynamicModifierItemLike>, situation: DynamicModifierSituation): GrantedEffect[] {
    const out: GrantedEffect[] = [];
    for (const item of items) {
        const grants = item.system.modifiers?.grantedEffects ?? [];
        const spec = item.system.specialization;
        const specialization = typeof spec === 'string' ? spec : '';
        for (const grant of grants) {
            if (!hookApplies(grant, situation, specialization)) continue;
            out.push({ kind: grant.kind, name: grant.name, uuid: grant.uuid, level: grant.level, source: item.name ?? '' });
        }
    }
    return out;
}

/**
 * The `quality`-kind subset of {@link collectGrantedEffects} — the grants the damage
 * pipeline turns into attack specials, so a granted Concussive (2) resolves through
 * exactly the same weapon-quality payload path as one the weapon carries natively.
 */
export function collectGrantedQualities(items: Iterable<DynamicModifierItemLike>, situation: DynamicModifierSituation): GrantedQuality[] {
    return collectGrantedEffects(items, situation)
        .filter((grant) => grant.kind === 'quality')
        .map(({ name, level, source }) => ({ name, level, source }));
}
