/**
 * Rogue Trader · Colony engine — *Stars of Inequity* "Colonial Structure"
 * (stars/stars.md §"COLONIAL STRUCTURE" / Table 3-3 Colony Growth / Table 3-4
 * Colonial Leadership). Audit issue #195.
 *
 * This module is the ENGINE only. Per Direction #7 the content data
 * (concrete Colony Types, Infrastructure Upgrades, Representative
 * abilities, Resource Abundance tables, Cultural Improvements, …) lives
 * in compendium documents; this file holds:
 *
 *   - The Colony Characteristic registry (Size + the four affective
 *     stats: Complacency, Order, Productivity, Piety) and their
 *     {min, max, default} clamp configuration.
 *   - The Size → "highest tier reached" name table (Outpost / Settlement /
 *     … / Hive — RT-RAW p.103) used purely for label resolution.
 *   - The 90-day growth-tick resolver: roll 1d10 + modifiers vs.
 *     Table 3-3, with PF "burn" bonuses, Resource-harvest growth
 *     bonuses, and Agricultural / Ecclesiastical attribute overrides
 *     left to the caller as `growthModifiers` and `softeners` inputs.
 *   - The Endeavour-completion integration: each completed Endeavour
 *     Objective Theme converts its Achievement-Point total into colony
 *     deltas via a pure mapping (Industry → Productivity, Creed →
 *     Piety, etc.). Per-Endeavour content (themes, Objective AP values)
 *     stays in compendiums; this is the arithmetic only.
 *   - "Threshold effects" — RT-RAW p.103: when a Characteristic exceeds
 *     Size, the Colony earns the matching positive trait (Placated /
 *     Orderly / Productive / Pious) and the cascading bonuses. When a
 *     Characteristic hits 0, the cascading penalty fires.
 *
 * Resolution is RT-gated. Six other systems may import the types for
 * structural awareness but the resolver is only invoked from the RT
 * Colonial Endeavour flow.
 *
 * No I/O, no actor reads, no randomness inside the math helpers — RNG
 * is injectable (`rng: () => number`) so vitest / storybook stay
 * deterministic.
 *
 * Player-facing labels are all `WH40K.RT.Colony.*` i18n keys; the
 * engine never emits hard-coded English (Direction #6).
 */

/* -------------------------------------------------------------------- */
/*  Characteristics                                                     */
/* -------------------------------------------------------------------- */

/**
 * Colony Characteristic keys. Size is unique in that it shifts on a
 * bounded 0..10 scale; the other four are unbounded above (RT-RAW: "a
 * scale that begins at 0 and increases from there"), but for plumbing
 * purposes we cap at 99 to keep the schema integers manageable.
 */
export type ColonyCharacteristicKey = 'size' | 'complacency' | 'order' | 'productivity' | 'piety';

export const COLONY_CHARACTERISTIC_KEYS: ReadonlyArray<ColonyCharacteristicKey> = Object.freeze(['size', 'complacency', 'order', 'productivity', 'piety']);

export interface ColonyCharacteristicSpec {
    /** Stable id, used for breakdowns and chat cards. */
    readonly id: ColonyCharacteristicKey;
    /** i18n key for the long label (e.g. `WH40K.RT.Colony.Characteristic.Size`). */
    readonly labelKey: string;
    /** Minimum value — every characteristic floors at 0. */
    readonly min: number;
    /** Maximum value. Size is bounded 0..10; affective stats cap at 99 (plumbing limit). */
    readonly max: number;
    /** Founding default. Overridden per Colony Type in the compendium. */
    readonly default: number;
}

export const COLONY_CHARACTERISTICS: Readonly<Record<ColonyCharacteristicKey, ColonyCharacteristicSpec>> = Object.freeze({
    size: { id: 'size', labelKey: 'WH40K.RT.Colony.Characteristic.Size', min: 0, max: 10, default: 1 },
    complacency: { id: 'complacency', labelKey: 'WH40K.RT.Colony.Characteristic.Complacency', min: 0, max: 99, default: 1 },
    order: { id: 'order', labelKey: 'WH40K.RT.Colony.Characteristic.Order', min: 0, max: 99, default: 1 },
    productivity: { id: 'productivity', labelKey: 'WH40K.RT.Colony.Characteristic.Productivity', min: 0, max: 99, default: 1 },
    piety: { id: 'piety', labelKey: 'WH40K.RT.Colony.Characteristic.Piety', min: 0, max: 99, default: 1 },
});

/**
 * Affective stats only — the four that respond to Endeavours, Leadership,
 * Infrastructure Upgrades, and threshold-effect cascades.
 */
export const COLONY_AFFECTIVE_KEYS: ReadonlyArray<Exclude<ColonyCharacteristicKey, 'size'>> = Object.freeze(['complacency', 'order', 'productivity', 'piety']);

/**
 * Clamp a characteristic to its registered [min, max]. Non-finite or
 * non-integer inputs are truncated. Used everywhere the resolver writes
 * back into the colony state.
 */
export function clampCharacteristic(key: ColonyCharacteristicKey, value: number): number {
    const spec = COLONY_CHARACTERISTICS[key];
    if (!Number.isFinite(value)) return spec.default;
    const truncated = Math.trunc(value);
    if (truncated < spec.min) return spec.min;
    if (truncated > spec.max) return spec.max;
    return truncated;
}

/* -------------------------------------------------------------------- */
/*  Size tier labels (Table 3-2)                                        */
/* -------------------------------------------------------------------- */

/**
 * Stars-of-Inequity p.103 "Colony Size" tier names. Size 0 = Abandoned
 * (the Colony has collapsed). Index = Size value.
 */
export type ColonyTierKey =
    | 'abandoned'
    | 'outpost'
    | 'settlement'
    | 'foothold'
    | 'colony'
    | 'holding'
    | 'dominion'
    | 'territory'
    | 'city'
    | 'metropolis'
    | 'hive';

export const COLONY_SIZE_TIERS: ReadonlyArray<{ readonly size: number; readonly tier: ColonyTierKey; readonly labelKey: string }> = Object.freeze([
    { size: 0, tier: 'abandoned', labelKey: 'WH40K.RT.Colony.Tier.Abandoned' },
    { size: 1, tier: 'outpost', labelKey: 'WH40K.RT.Colony.Tier.Outpost' },
    { size: 2, tier: 'settlement', labelKey: 'WH40K.RT.Colony.Tier.Settlement' },
    { size: 3, tier: 'foothold', labelKey: 'WH40K.RT.Colony.Tier.Foothold' },
    { size: 4, tier: 'colony', labelKey: 'WH40K.RT.Colony.Tier.Colony' },
    { size: 5, tier: 'holding', labelKey: 'WH40K.RT.Colony.Tier.Holding' },
    { size: 6, tier: 'dominion', labelKey: 'WH40K.RT.Colony.Tier.Dominion' },
    { size: 7, tier: 'territory', labelKey: 'WH40K.RT.Colony.Tier.Territory' },
    { size: 8, tier: 'city', labelKey: 'WH40K.RT.Colony.Tier.City' },
    { size: 9, tier: 'metropolis', labelKey: 'WH40K.RT.Colony.Tier.Metropolis' },
    { size: 10, tier: 'hive', labelKey: 'WH40K.RT.Colony.Tier.Hive' },
]);

export function tierForSize(size: number): ColonyTierKey {
    const clamped = clampCharacteristic('size', size);
    const row = COLONY_SIZE_TIERS[clamped];
    // Defensive: the table is exhaustive 0..10 but the type-system can't
    // see that, and noUncheckedIndexedAccess returns `… | undefined`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test.json lacks noUncheckedIndexedAccess; main tsconfig requires this guard
    if (row === undefined) return 'abandoned';
    return row.tier;
}

/* -------------------------------------------------------------------- */
/*  Threshold effects (Characteristic > Size  ↔  Characteristic == 0)   */
/* -------------------------------------------------------------------- */

/**
 * Stars-of-Inequity p.103-104 cascading effects. The resolver returns
 * these as a flat list of effects keyed by the affected stat + sign;
 * the consumer applies them to the Colony state (or surfaces them on
 * the chat card if the Colony state is read-only).
 */
export type ColonyEffectKind =
    // Characteristic > Size — positive cascade.
    | 'placated' // Complacency > Size → PF Value +1
    | 'orderly' // Order > Size → Productivity +2
    | 'productive' // Productivity > Size → PF Value +2
    | 'pious' // Piety > Size → Order +1, Complacency +1
    // Characteristic == 0 — negative cascade.
    | 'unhappy' // Complacency 0 → Order -1d5, Productivity -1d5 (locked)
    | 'anarchy' // Order 0 → PF Value = 0; per cycle: Complacency / Productivity / Piety / Size each fall
    | 'idle' // Productivity 0 → PF Value halved (round up)
    | 'apostate'; // Piety 0 → Order -1d5, Complacency -1d5 (locked)

export interface ColonyEffectDef {
    readonly id: ColonyEffectKind;
    readonly labelKey: string;
    /** Which stat must exceed Size (positive cascade) or be 0 (negative cascade). */
    readonly trigger: { stat: Exclude<ColonyCharacteristicKey, 'size'>; mode: 'aboveSize' | 'atZero' };
}

export const COLONY_EFFECTS: ReadonlyArray<ColonyEffectDef> = Object.freeze([
    { id: 'placated', labelKey: 'WH40K.RT.Colony.Effect.Placated', trigger: { stat: 'complacency', mode: 'aboveSize' } },
    { id: 'orderly', labelKey: 'WH40K.RT.Colony.Effect.Orderly', trigger: { stat: 'order', mode: 'aboveSize' } },
    { id: 'productive', labelKey: 'WH40K.RT.Colony.Effect.Productive', trigger: { stat: 'productivity', mode: 'aboveSize' } },
    { id: 'pious', labelKey: 'WH40K.RT.Colony.Effect.Pious', trigger: { stat: 'piety', mode: 'aboveSize' } },
    { id: 'unhappy', labelKey: 'WH40K.RT.Colony.Effect.Unhappy', trigger: { stat: 'complacency', mode: 'atZero' } },
    { id: 'anarchy', labelKey: 'WH40K.RT.Colony.Effect.Anarchy', trigger: { stat: 'order', mode: 'atZero' } },
    { id: 'idle', labelKey: 'WH40K.RT.Colony.Effect.Idle', trigger: { stat: 'productivity', mode: 'atZero' } },
    { id: 'apostate', labelKey: 'WH40K.RT.Colony.Effect.Apostate', trigger: { stat: 'piety', mode: 'atZero' } },
]);

export interface ColonyState {
    readonly size: number;
    readonly complacency: number;
    readonly order: number;
    readonly productivity: number;
    readonly piety: number;
}

/**
 * Return every threshold effect currently active on the given state.
 * Pure function — no randomness. Used both by the growth-tick resolver
 * (to apply the cycle-end consequences) and by chat-card rendering (to
 * display the active traits).
 */
export function activeColonyEffects(state: ColonyState): ReadonlyArray<ColonyEffectDef> {
    const result: ColonyEffectDef[] = [];
    for (const def of COLONY_EFFECTS) {
        const statValue = state[def.trigger.stat];
        if (def.trigger.mode === 'aboveSize' && statValue > state.size) {
            result.push(def);
        } else if (def.trigger.mode === 'atZero' && statValue <= 0) {
            result.push(def);
        }
    }
    return result;
}

/* -------------------------------------------------------------------- */
/*  Profit Factor Value (RAW: PF generated by Colony per 90-day cycle)  */
/* -------------------------------------------------------------------- */

/**
 * Compute the Profit Factor Value modifier from active threshold effects.
 * Returns the delta-to-base PF Value (caller adds it to the Colony's base).
 * Anarchy zeroes PF Value; Idle halves it (rounded up).
 *
 * This is a pure mapping over the active effects so consumers can pull
 * the breakdown for a chat card.
 */
export interface PfValueAdjustment {
    /** Additive delta to the base PF Value (+1 Placated, +2 Productive, …). */
    readonly delta: number;
    /** Multiplicative factor (1 normally, 0 under Anarchy, 0.5 under Idle). */
    readonly factor: number;
    /** Effects contributing to the delta / factor. */
    readonly contributors: ReadonlyArray<ColonyEffectKind>;
}

export function profitFactorValueAdjustment(state: ColonyState): PfValueAdjustment {
    let delta = 0;
    let factor = 1;
    const contributors: ColonyEffectKind[] = [];
    // 'orderly' / 'pious' / 'unhappy' / 'apostate' cascade on the other stats
    // but do not directly modify PF Value, so they have no handler entry.
    const PF_HANDLERS: Partial<Record<ColonyEffectKind, () => void>> = {
        placated: () => {
            delta += 1;
        },
        productive: () => {
            delta += 2;
        },
        anarchy: () => {
            factor = 0;
        },
        idle: () => {
            // Combine multiplicatively; idle halves regardless of order.
            factor = Math.min(factor, 0.5);
        },
    };
    for (const eff of activeColonyEffects(state)) {
        const handler = PF_HANDLERS[eff.id];
        if (handler) {
            handler();
            contributors.push(eff.id);
        }
    }
    return { delta, factor, contributors };
}

/**
 * Apply the PF Value adjustment to a base value: `ceil((base + delta) * factor)`.
 * Anarchy → 0 regardless of base. Negative results clamp to 0.
 */
export function applyPfValueAdjustment(base: number, adj: PfValueAdjustment): number {
    if (adj.factor === 0) return 0;
    const raw = (base + adj.delta) * adj.factor;
    // RAW says Idle halves "rounding up" — apply ceil for the halving case
    // and trunc for the unmodified case (factor === 1) to keep integer PF.
    const rounded = adj.factor < 1 ? Math.ceil(raw) : Math.trunc(raw);
    return rounded < 0 ? 0 : rounded;
}

/* -------------------------------------------------------------------- */
/*  90-day Colony Growth tick (Table 3-3)                               */
/* -------------------------------------------------------------------- */

/**
 * Stars-of-Inequity Table 3-3 — 1d10 + modifiers:
 *   1–2 → Size −1 (and 1d5−3 minimum-1 to a random non-Size stat)
 *   3–7 → no change
 *   ≥8  → Size +1 (Explorers may invest in Infrastructure Upgrades)
 */
export type ColonyGrowthOutcome = 'decrease' | 'noChange' | 'increase';

export interface ColonyGrowthInput {
    readonly state: ColonyState;
    /**
     * Total modifier added to the 1d10 result. Sources: Profit-Factor
     * burn ("burn N PF → +N to next growth roll"), Resource-harvest
     * conversion ("harvest grows the Colony: +1d5"), GM situational
     * adjustments, etc. The caller pre-resolves these into one integer
     * so the engine stays content-agnostic.
     */
    readonly growthModifier?: number;
    /**
     * Agricultural-Colony "softener" — RAW: when an Agricultural Colony's
     * Size would decrease, roll 1d10; on 8+ it does not. Caller passes
     * `true` to enable the reroll-on-decrease behaviour.
     */
    readonly agriculturalSoftener?: boolean;
    /**
     * Ecclesiastical-Colony "Order → Piety swap" — RAW: an Ecclesiastical
     * Colony can take any Order-loss as Piety-loss instead. Caller passes
     * `true` to enable; the decrease side-effect (Size−1 → random stat
     * −1d5+min 1) re-routes any chosen Order roll onto Piety instead.
     */
    readonly ecclesiasticalOrderSwap?: boolean;
    /**
     * Optional RNG (returns a uniform number in [0, 1)). Default
     * `Math.random`. Tests pass a seeded function.
     */
    readonly rng?: () => number;
}

export interface ColonyGrowthResult {
    readonly outcome: ColonyGrowthOutcome;
    readonly growthRoll: number;
    /** growthRoll + modifier. The table reads off this value. */
    readonly growthTotal: number;
    /** Modifier applied (echoed back for chat-card display). */
    readonly modifier: number;
    /** New Colony state after applying the outcome's deltas. */
    readonly nextState: ColonyState;
    /** Per-stat deltas applied to produce nextState. */
    readonly deltas: Partial<Record<ColonyCharacteristicKey, number>>;
    /**
     * On a decrease, which stat absorbed the 1d5−3 (minimum 1) penalty
     * (or `null` if no decrease).
     */
    readonly decreasedStat: Exclude<ColonyCharacteristicKey, 'size'> | null;
    /** If `agriculturalSoftener` triggered, the d10 result that saved it. */
    readonly softenerRoll: number | null;
    /** Threshold effects active AFTER the tick resolves. */
    readonly activeEffects: ReadonlyArray<ColonyEffectKind>;
}

const D10 = (rng: () => number): number => {
    const r = rng();
    // [0, 1) → 1..10. Clamp finite-noise inputs.
    const v = Math.floor(r * 10) + 1;
    if (v < 1) return 1;
    if (v > 10) return 10;
    return v;
};

const D5 = (rng: () => number): number => {
    const v = Math.floor(rng() * 5) + 1;
    if (v < 1) return 1;
    if (v > 5) return 5;
    return v;
};

/** Affective keys excluding Size, used for "random stat" picking. */
const AFFECTIVE_FOR_PENALTY: ReadonlyArray<Exclude<ColonyCharacteristicKey, 'size'>> = COLONY_AFFECTIVE_KEYS;

const PICK_FROM = <T>(arr: ReadonlyArray<T>, rng: () => number): T => {
    if (arr.length === 0) {
        throw new Error('rt-colony: cannot pick from empty array');
    }
    const idx = Math.floor(rng() * arr.length);
    const safe = idx < 0 ? 0 : idx >= arr.length ? arr.length - 1 : idx;
    const v = arr[safe];
    // noUncheckedIndexedAccess guard — arr.length > 0 and safe in range,
    // so v cannot actually be undefined.
    if (v === undefined) {
        // istanbul ignore next -- unreachable under the bounds check above
        throw new Error('rt-colony: pick index produced undefined');
    }
    return v;
};

/**
 * Roll one 90-day growth cycle for the Colony. Pure function modulo the
 * injected RNG; default RNG is Math.random.
 *
 * Outcome table:
 *  - growthTotal ≤ 2 → Size −1, random non-Size stat −max(1, 1d5−3),
 *    floored at the stat's clamp minimum.
 *  - 3..7 → no change.
 *  - ≥ 8 → Size +1 (Infrastructure-Upgrade investment is the consumer's
 *    follow-up step; the engine only mutates Size).
 */
export function resolveColonyGrowth(input: ColonyGrowthInput): ColonyGrowthResult {
    const rng = input.rng ?? Math.random;
    const modifier = Math.trunc(input.growthModifier ?? 0);
    const growthRoll = D10(rng);
    const growthTotal = growthRoll + modifier;

    let outcome: ColonyGrowthOutcome;
    if (growthTotal <= 2) outcome = 'decrease';
    else if (growthTotal >= 8) outcome = 'increase';
    else outcome = 'noChange';

    const deltas: Partial<Record<ColonyCharacteristicKey, number>> = {};
    let decreasedStat: Exclude<ColonyCharacteristicKey, 'size'> | null = null;
    let softenerRoll: number | null = null;
    const next: { -readonly [K in keyof ColonyState]: ColonyState[K] } = { ...input.state };

    if (outcome === 'decrease') {
        // Agricultural softener: 1d10 ≥ 8 means the decrease is averted.
        if (input.agriculturalSoftener === true) {
            const r = D10(rng);
            softenerRoll = r;
            if (r >= 8) {
                outcome = 'noChange';
            }
        }

        if (outcome === 'decrease') {
            // Pick a random non-Size stat for the 1d5−3 (min 1) penalty.
            // RAW: "one randomly chosen Characteristic (other than Size)
            // decreases by 1d5−3 (to a minimum of 1)". We read this as
            // "the stat decreases by an amount that is at minimum 1 (and
            // capped by the d5−3 value when that exceeds 1)" — i.e.
            // amount = max(1, d5 − 3).
            let pick = PICK_FROM(AFFECTIVE_FOR_PENALTY, rng);
            if (pick === 'order' && input.ecclesiasticalOrderSwap === true) {
                pick = 'piety';
            }
            const d5 = D5(rng);
            const penalty = Math.max(1, d5 - 3);
            decreasedStat = pick;

            const nextSize = clampCharacteristic('size', input.state.size - 1);
            deltas.size = nextSize - input.state.size;
            next.size = nextSize;

            const beforeStat = input.state[pick];
            const nextStat = clampCharacteristic(pick, beforeStat - penalty);
            deltas[pick] = nextStat - beforeStat;
            next[pick] = nextStat;
        }
    }

    if (outcome === 'increase') {
        const nextSize = clampCharacteristic('size', input.state.size + 1);
        deltas.size = nextSize - input.state.size;
        next.size = nextSize;
    }

    const activeEffects = activeColonyEffects(next).map((e) => e.id);

    return {
        outcome,
        growthRoll,
        growthTotal,
        modifier,
        nextState: next,
        deltas,
        decreasedStat,
        softenerRoll,
        activeEffects,
    };
}

/* -------------------------------------------------------------------- */
/*  Endeavour integration                                               */
/* -------------------------------------------------------------------- */

/**
 * Endeavour Objective Themes — RT-RAW Objective Themes (Exploration,
 * Trade, Military, Criminal, Creed) plus the Stars-of-Inequity Colonial
 * Themes (Industry, Research, Agriculture). Caller passes the theme
 * of each completed Endeavour Objective along with its AP total; the
 * engine converts AP into Colony deltas.
 *
 * The mapping (theme → which Characteristic receives the boost) lives
 * in this file because it's content-agnostic plumbing: an Industry
 * Endeavour grows Productivity, a Creed Endeavour grows Piety, etc.
 * The actual Endeavour entries (their themes, AP requirements) live in
 * compendiums and feed `applyEndeavour({ theme, ap })`.
 */
export type EndeavourTheme = 'exploration' | 'trade' | 'military' | 'criminal' | 'creed' | 'industry' | 'research' | 'agriculture';

export const ENDEAVOUR_THEMES: ReadonlyArray<EndeavourTheme> = Object.freeze([
    'exploration',
    'trade',
    'military',
    'criminal',
    'creed',
    'industry',
    'research',
    'agriculture',
]);

/**
 * AP-to-Characteristic conversion divisor — 100 AP per +1 to the
 * targeted stat (1 Objective = 100 AP under RT-RAW). Whole-number
 * division; partial AP rolls over to the next cycle in the calling
 * Endeavour bookkeeping (not modelled here).
 */
export const AP_PER_CHARACTERISTIC_POINT = 100;

/**
 * Per-theme mapping of which Characteristic absorbs the AP.
 *
 * Notes vs. RAW:
 *  - Trade / Exploration → Complacency (improved standard of living).
 *  - Military → Order (Garrisons enforce stability).
 *  - Criminal → Productivity (smuggling moves goods, RAW p.110 Complacency
 *    softener handled separately as a Representative trait).
 *  - Creed → Piety.
 *  - Industry → Productivity.
 *  - Research → Complacency (Research Mission RAW: "+2 Productivity and
 *    +1 PF on Organic / Archeotech / Xenos harvests" — that's a
 *    harvesting bonus, not Endeavour conversion; we channel the
 *    Endeavour AP to Complacency as the morale/prestige delta).
 *  - Agriculture → Complacency (food supply → general well-being).
 */
export const ENDEAVOUR_THEME_MAPPING: Readonly<Record<EndeavourTheme, Exclude<ColonyCharacteristicKey, 'size'>>> = Object.freeze({
    exploration: 'complacency',
    trade: 'complacency',
    military: 'order',
    criminal: 'productivity',
    creed: 'piety',
    industry: 'productivity',
    research: 'complacency',
    agriculture: 'complacency',
});

export interface EndeavourCompletion {
    readonly theme: EndeavourTheme;
    /** Total Achievement Points earned by the Endeavour. */
    readonly ap: number;
}

export interface ApplyEndeavoursResult {
    readonly nextState: ColonyState;
    readonly deltas: Partial<Record<ColonyCharacteristicKey, number>>;
    /** Sum of points per stat, before clamping (useful for chat cards). */
    readonly rawPoints: Partial<Record<Exclude<ColonyCharacteristicKey, 'size'>, number>>;
    /** Threshold effects active after applying. */
    readonly activeEffects: ReadonlyArray<ColonyEffectKind>;
}

/**
 * Apply a batch of completed Endeavours to a Colony state, returning the
 * new state and per-stat deltas. Pure function.
 *
 * AP / theme math:
 *   pointsForStat = sum over endeavours of theme==stat of floor(ap / 100)
 *
 * Each whole 100-AP block contributes +1 to the mapped Characteristic.
 * Leftover AP is discarded by this engine — the Endeavour DataModel is
 * the bookkeeper for rollover.
 */
export function applyEndeavours(state: ColonyState, endeavours: ReadonlyArray<EndeavourCompletion>): ApplyEndeavoursResult {
    const rawPoints: Partial<Record<Exclude<ColonyCharacteristicKey, 'size'>, number>> = {};
    for (const e of endeavours) {
        const stat = ENDEAVOUR_THEME_MAPPING[e.theme];
        const points = Math.max(0, Math.floor(e.ap / AP_PER_CHARACTERISTIC_POINT));
        rawPoints[stat] = (rawPoints[stat] ?? 0) + points;
    }

    const next: { -readonly [K in keyof ColonyState]: ColonyState[K] } = { ...state };
    const deltas: Partial<Record<ColonyCharacteristicKey, number>> = {};

    for (const key of COLONY_AFFECTIVE_KEYS) {
        const gain = rawPoints[key];
        if (gain === undefined || gain === 0) continue;
        const before = state[key];
        const after = clampCharacteristic(key, before + gain);
        const d = after - before;
        if (d !== 0) deltas[key] = d;
        next[key] = after;
    }

    const activeEffects = activeColonyEffects(next).map((e) => e.id);

    return { nextState: next, deltas, rawPoints, activeEffects };
}

/* -------------------------------------------------------------------- */
/*  Leadership (Table 3-4)                                              */
/* -------------------------------------------------------------------- */

/**
 * Table 3-4 — Highest of Leader's Int / Per / Fel **bonus** (characteristic
 * bonus = first digit of the 1..99 characteristic, so 35 Int → 3) →
 * Colony PF Value modifier.
 *
 * Below 2 clamps to the −2 row; above 6 clamps to the +2 row (RAW
 * tops out at +6; a Leader with Bonus ≥ 7 is treated identically).
 */
export interface LeadershipPfModifierInput {
    readonly intBonus: number;
    readonly perBonus: number;
    readonly felBonus: number;
}

export function leadershipPfValueModifier(input: LeadershipPfModifierInput): number {
    const high = Math.max(input.intBonus, input.perBonus, input.felBonus);
    if (high <= 2) return -2;
    if (high === 3) return -1;
    if (high === 4) return 0;
    if (high === 5) return 1;
    return 2; // 6 or higher.
}

/* -------------------------------------------------------------------- */
/*  Founding (Colony Type starting Characteristics)                     */
/* -------------------------------------------------------------------- */

/**
 * A founded-Colony state seed. The Type itself is a content document
 * (compendium item); this is the shape its boot deltas must produce.
 * Per Direction #7 the actual Type → starting-stats table lives in the
 * compendium, not here — but the four RAW Type templates are encoded
 * as the engine's reference fixtures so consumers can spot-check
 * compendium drift.
 */
export interface ColonyTypeSeed {
    readonly id: string;
    readonly labelKey: string;
    readonly starting: ColonyState;
}

/**
 * Reference fixtures of the four canonical Colony Types. Consumers
 * should resolve the founding state from the compendium document when
 * one exists; these defaults exist purely so the engine can be tested
 * and storybook-rendered without a compendium dependency.
 */
export const REFERENCE_COLONY_TYPES: Readonly<Record<string, ColonyTypeSeed>> = Object.freeze({
    'research-mission': {
        id: 'research-mission',
        labelKey: 'WH40K.RT.Colony.Type.ResearchMission',
        starting: { size: 1, complacency: 2, productivity: 1, order: 1, piety: 1 },
    },
    'mining-industry': {
        id: 'mining-industry',
        labelKey: 'WH40K.RT.Colony.Type.MiningIndustry',
        starting: { size: 1, complacency: 1, productivity: 2, order: 1, piety: 1 },
    },
    'ecclesiastical': {
        id: 'ecclesiastical',
        labelKey: 'WH40K.RT.Colony.Type.Ecclesiastical',
        starting: { size: 1, complacency: 1, productivity: 1, order: 2, piety: 2 },
    },
    'agricultural': {
        id: 'agricultural',
        labelKey: 'WH40K.RT.Colony.Type.Agricultural',
        starting: { size: 1, complacency: 1, productivity: 1, order: 2, piety: 1 },
    },
});
