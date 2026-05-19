/**
 * Acquisition Scale resolver — RT core, Table 9-35: Acquisition Modifiers
 * (core.md §12256 et seq.) plus the supporting "Automatic Success and
 * Failure" (core.md §12234) and "Combining Acquisitions" (core.md §12226)
 * rules.
 *
 * The Rogue Trader Acquisition Test rolls 1d100 ≤ (Profit Factor +
 * Availability + Craftsmanship + Scale + extra). Two short-circuits
 * apply **before** any die is rolled:
 *
 * - Adjusted PF ≥ 100 → automatic success.
 * - Adjusted PF ≤ 0   → automatic failure.
 *
 * When a single test acquires a composite item (e.g. laspistol with a
 * red-dot laser sight), the Combining Acquisitions rule applies: use
 * the greatest Availability penalty among the components as the base,
 * then subtract 5 per *additional* component beyond the first.
 *
 * This module is **content-agnostic**: it holds the table math only.
 * Player-facing labels live in the langpack under `WH40K.AcquisitionScale.*`.
 * The dialog is the only consumer that touches Profit Factor state.
 *
 * Per Direction #3 (homologation), the resolver itself is system-neutral
 * arithmetic — only the RT acquisition flow invokes it. Six other systems
 * are unaffected.
 */

/* -------------------------------------------------------------------- */
/*  Availability                                                        */
/* -------------------------------------------------------------------- */

export type AvailabilityKey =
    | 'ubiquitous'
    | 'abundant'
    | 'plentiful'
    | 'common'
    | 'average'
    | 'scarce'
    | 'rare'
    | 'veryRare'
    | 'extremelyRare'
    | 'nearUnique'
    | 'unique';

/**
 * Table 9-35 Availability column (RT core p.272). Values are absolute
 * Acquisition Modifier contributions — added to PF before the roll.
 */
export const ACQUISITION_AVAILABILITY_MODIFIERS: Record<AvailabilityKey, number> = {
    ubiquitous: 70,
    abundant: 50,
    plentiful: 30,
    common: 20,
    average: 10,
    scarce: 0,
    rare: -10,
    veryRare: -20,
    extremelyRare: -30,
    nearUnique: -50,
    unique: -70,
};

/**
 * Case-insensitive, separator-tolerant lookup that resolves hyphenated /
 * spaced / Title-Case variants (`'very rare'`, `'Very Rare'`,
 * `'very-rare'`, `'veryRare'`) to a canonical AvailabilityKey. Returns
 * null if no match — callers fall back to `'scarce'` (the table's 0).
 *
 * This is the normalisation the dialog needs because `PhysicalItemTemplate`
 * stores availability lowercased with space separators while ship
 * components stored hyphenated (`'very-rare'`) — see issue #192.
 */
export function normaliseAvailability(raw: string | null | undefined): AvailabilityKey | null {
    if (raw === null || raw === undefined) return null;
    const collapsed = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
    switch (collapsed) {
        case 'ubiquitous':
            return 'ubiquitous';
        case 'abundant':
            return 'abundant';
        case 'plentiful':
            return 'plentiful';
        case 'common':
            return 'common';
        case 'average':
            return 'average';
        case 'scarce':
            return 'scarce';
        case 'rare':
            return 'rare';
        case 'veryrare':
            return 'veryRare';
        case 'extremelyrare':
            return 'extremelyRare';
        case 'nearunique':
            return 'nearUnique';
        case 'unique':
            return 'unique';
        default:
            return null;
    }
}

/* -------------------------------------------------------------------- */
/*  Craftsmanship                                                       */
/* -------------------------------------------------------------------- */

export type CraftsmanshipKey = 'poor' | 'common' | 'good' | 'best';

/**
 * Table 9-35 Craftsmanship column. Note: RT diverges from DH2 here —
 * Best is −30 (RT), not −20 (DH2-style). Treat this as RT-specific.
 */
export const ACQUISITION_CRAFTSMANSHIP_MODIFIERS: Record<CraftsmanshipKey, number> = {
    poor: 10,
    common: 0,
    good: -10,
    best: -30,
};

export function normaliseCraftsmanship(raw: string | null | undefined): CraftsmanshipKey | null {
    if (raw === null || raw === undefined) return null;
    const collapsed = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
    switch (collapsed) {
        case 'poor':
            return 'poor';
        case 'common':
            return 'common';
        case 'good':
            return 'good';
        case 'best':
            return 'best';
        default:
            return null;
    }
}

/* -------------------------------------------------------------------- */
/*  Scale                                                               */
/* -------------------------------------------------------------------- */

export type ScaleKey = 'negligible' | 'trivial' | 'minor' | 'standard' | 'major' | 'significant' | 'vast';

/**
 * Table 9-35 Scale column. Default for personal items is Negligible
 * (+30) — this is the modifier Herodor uses for a single pistol in the
 * core.md example.
 */
export const ACQUISITION_SCALE_MODIFIERS: Record<ScaleKey, number> = {
    negligible: 30,
    trivial: 20,
    minor: 10,
    standard: 0,
    major: -10,
    significant: -20,
    vast: -30,
};

export function normaliseScale(raw: string | null | undefined): ScaleKey | null {
    if (raw === null || raw === undefined) return null;
    const collapsed = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
    switch (collapsed) {
        case 'negligible':
            return 'negligible';
        case 'trivial':
            return 'trivial';
        case 'minor':
            return 'minor';
        case 'standard':
            return 'standard';
        case 'major':
            return 'major';
        // 'Significan' in the source MD is a transcription typo; accept both.
        case 'significant':
        case 'significan':
            return 'significant';
        case 'vast':
            return 'vast';
        default:
            return null;
    }
}

/* -------------------------------------------------------------------- */
/*  Combining Acquisitions                                              */
/* -------------------------------------------------------------------- */

/**
 * RT core §"Combining Acquisitions" (core.md §12226):
 * "compare the Availability of the item's components and use the
 *  greatest penalty to determine a base Availability Modifier. Each
 *  additional component then results in an additional -5 penalty to
 *  the base Availability Modifier."
 *
 * "Greatest penalty" means the *lowest* (most negative) modifier among
 * the components. Returns the base availability modifier together with
 * the combining penalty contribution as a separate breakdown line so the
 * chat card can show the math.
 *
 * Components may be passed as canonical keys or as the canonical
 * modifier integers; the caller picks. Empty / single-component inputs
 * are passed through with no combining penalty.
 */
export interface CombineAvailabilityInput {
    /** Component availability keys. Length 0 or 1 short-circuits to no combine. */
    components: ReadonlyArray<AvailabilityKey>;
}

export interface CombineAvailabilityResult {
    /** The base availability mod = min(component mods). 0 if components empty. */
    baseModifier: number;
    /** -5 × (componentCount - 1), clamped at 0 when there's <2 components. */
    combinePenalty: number;
    /** baseModifier + combinePenalty. */
    total: number;
    /** Number of components beyond the first. */
    extraComponents: number;
}

export function combineAvailabilityModifier(input: CombineAvailabilityInput): CombineAvailabilityResult {
    if (input.components.length === 0) {
        return { baseModifier: 0, combinePenalty: 0, total: 0, extraComponents: 0 };
    }
    const mods = input.components.map((k) => ACQUISITION_AVAILABILITY_MODIFIERS[k]);
    // "Greatest penalty" = lowest (most negative) modifier among components.
    let base = mods[0] ?? 0;
    for (const m of mods) {
        if (m < base) base = m;
    }
    const extra = Math.max(0, input.components.length - 1);
    // `extra > 0 ? -5*extra : 0` — guards against the JS signed-zero quirk
    // (-5 * 0 === -0, which fails Object.is(0)).
    const penalty = extra > 0 ? -5 * extra : 0;
    return { baseModifier: base, combinePenalty: penalty, total: base + penalty, extraComponents: extra };
}

/* -------------------------------------------------------------------- */
/*  Resolver                                                            */
/* -------------------------------------------------------------------- */

export interface ResolveAcquisitionInput {
    /** Current Profit Factor (whole number). */
    profitFactor: number;
    /**
     * Availability key — used when not combining. Mutually exclusive
     * with `components`; if both are provided, `components` wins.
     */
    availability?: AvailabilityKey;
    /** Components for a Combining Acquisitions test. Overrides `availability`. */
    components?: ReadonlyArray<AvailabilityKey>;
    /** Craftsmanship (defaults to Common = +0 if omitted). */
    craftsmanship?: CraftsmanshipKey;
    /** Scale (defaults to Negligible = +30 — single personal item). */
    scale?: ScaleKey;
    /** GM / situational modifier (Commerce result, faction discount, etc.). */
    extra?: number;
}

export interface AcquisitionBreakdownEntry {
    /** i18n key for the row label. */
    labelKey: string;
    /** Optional template-substitution values (e.g. component count). */
    labelArgs?: Record<string, string | number>;
    /** Modifier value contributed by this row. */
    value: number;
}

export interface ResolveAcquisitionResult {
    /**
     * Final Acquisition Test target. This is PF + sum(modifiers), NOT
     * clamped — the auto-success / auto-fail bands sit *outside* the
     * roll-able 1..100 window, so the dialog needs the raw number.
     */
    target: number;
    /** True when target ≥ 100 before rolling. */
    autoSuccess: boolean;
    /** True when target ≤ 0 before rolling. */
    autoFail: boolean;
    /** Sum of modifier contributions (everything except base PF). */
    totalModifier: number;
    /** Per-row contributions, in evaluation order, for chat-card display. */
    breakdown: ReadonlyArray<AcquisitionBreakdownEntry>;
}

const SIX_DIGIT_TRUNC = (n: number): number => Math.trunc(n);

/**
 * Pure resolver. No I/O, no actor reads, no random.
 *
 * Composition order matches the RT core example (Herodor / Lady Fane):
 *   PF + Availability (or combined Availability) + Craftsmanship + Scale + extra.
 *
 * Auto-success / auto-fail are evaluated against the **adjusted** PF
 * (i.e. target), per core.md §12238–12239.
 */
export function resolveAcquisitionTest(input: ResolveAcquisitionInput): ResolveAcquisitionResult {
    const pf = SIX_DIGIT_TRUNC(input.profitFactor);
    const breakdown: AcquisitionBreakdownEntry[] = [];

    // 1. Availability — combined or single.
    let availabilityValue = 0;
    if (input.components !== undefined && input.components.length > 0) {
        const combined = combineAvailabilityModifier({ components: input.components });
        availabilityValue = combined.total;
        breakdown.push({
            labelKey: 'WH40K.AcquisitionScale.Availability',
            value: combined.baseModifier,
        });
        if (combined.extraComponents > 0) {
            breakdown.push({
                labelKey: 'WH40K.AcquisitionScale.CombinePenalty',
                labelArgs: { count: combined.extraComponents },
                value: combined.combinePenalty,
            });
        }
    } else if (input.availability !== undefined) {
        availabilityValue = ACQUISITION_AVAILABILITY_MODIFIERS[input.availability];
        breakdown.push({
            labelKey: 'WH40K.AcquisitionScale.Availability',
            value: availabilityValue,
        });
    } else {
        breakdown.push({ labelKey: 'WH40K.AcquisitionScale.Availability', value: 0 });
    }

    // 2. Craftsmanship.
    const craftKey: CraftsmanshipKey = input.craftsmanship ?? 'common';
    const craftValue = ACQUISITION_CRAFTSMANSHIP_MODIFIERS[craftKey];
    breakdown.push({ labelKey: 'WH40K.AcquisitionScale.Craftsmanship', value: craftValue });

    // 3. Scale.
    const scaleKey: ScaleKey = input.scale ?? 'negligible';
    const scaleValue = ACQUISITION_SCALE_MODIFIERS[scaleKey];
    breakdown.push({ labelKey: 'WH40K.AcquisitionScale.Scale', value: scaleValue });

    // 4. Extra (situational / Commerce result / haggle).
    const extra = input.extra ?? 0;
    if (extra !== 0) {
        breakdown.push({ labelKey: 'WH40K.AcquisitionScale.Extra', value: extra });
    }

    const totalModifier = availabilityValue + craftValue + scaleValue + extra;
    const target = pf + totalModifier;

    return {
        target,
        autoSuccess: target >= 100,
        autoFail: target <= 0,
        totalModifier,
        breakdown,
    };
}

/* -------------------------------------------------------------------- */
/*  Ordered keys (for templates / dropdowns)                            */
/* -------------------------------------------------------------------- */

export const AVAILABILITY_KEYS_ORDERED: ReadonlyArray<AvailabilityKey> = [
    'ubiquitous',
    'abundant',
    'plentiful',
    'common',
    'average',
    'scarce',
    'rare',
    'veryRare',
    'extremelyRare',
    'nearUnique',
    'unique',
];

export const CRAFTSMANSHIP_KEYS_ORDERED: ReadonlyArray<CraftsmanshipKey> = ['poor', 'common', 'good', 'best'];

export const SCALE_KEYS_ORDERED: ReadonlyArray<ScaleKey> = ['negligible', 'trivial', 'minor', 'standard', 'major', 'significant', 'vast'];
