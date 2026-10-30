/**
 * Acquisition Scale resolver — Rogue Trader's Acquisition Modifiers table
 * plus the supporting "Automatic Success and Failure" and "Combining
 * Acquisitions" rules.
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

import { RT_ACQUISITION_LADDER } from '../config/game-systems/rt-config.ts';
import type { AvailabilityKey, CraftsmanshipKey } from './acquisition-ladder.ts';

/*
 * The Availability and Craftsmanship columns of the Acquisition Modifiers table are Rogue Trader's
 * acquisition ladder, read from the line's config (`RT_ACQUISITION_LADDER`),
 * its single source (#192). Every RT cell is a number.
 */
const RT_AVAILABILITY_MODIFIERS = RT_ACQUISITION_LADDER.availability;
const RT_CRAFTSMANSHIP_MODIFIERS = RT_ACQUISITION_LADDER.craftsmanship;

/* -------------------------------------------------------------------- */
/*  Scale                                                               */
/* -------------------------------------------------------------------- */

export type ScaleKey = 'negligible' | 'trivial' | 'minor' | 'standard' | 'major' | 'significant' | 'vast';

/**
 * Acquisition Modifiers Scale column. Default for personal items is Negligible
 * (+30) — this is the modifier Herodor uses for a single pistol in the
 * rules' worked example.
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

const SCALE_NORMALISATION: Readonly<Record<string, ScaleKey>> = {
    negligible: 'negligible',
    trivial: 'trivial',
    minor: 'minor',
    standard: 'standard',
    major: 'major',
    significant: 'significant',
    // 'Significan' in the source MD is a transcription typo; accept both.
    significan: 'significant',
    vast: 'vast',
};

export function normaliseScale(raw: string | null | undefined): ScaleKey | null {
    if (raw === null || raw === undefined) return null;
    const collapsed = raw
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
    return SCALE_NORMALISATION[collapsed] ?? null;
}

/* -------------------------------------------------------------------- */
/*  Combining Acquisitions                                              */
/* -------------------------------------------------------------------- */

/**
 * RT "Combining Acquisitions", in summary: the
 * component with the worst Availability sets the base modifier, and every
 * component past the first adds a further -5.
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
    const mods = input.components.map((k) => RT_AVAILABILITY_MODIFIERS[k]);
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

interface AcquisitionBreakdownEntry {
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
 * Composition order matches the RT worked example (Herodor / Lady Fane):
 *   PF + Availability (or combined Availability) + Craftsmanship + Scale + extra.
 *
 * Auto-success / auto-fail are evaluated against the **adjusted** PF
 * (i.e. target), per "Automatic Success and Failure".
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
        availabilityValue = RT_AVAILABILITY_MODIFIERS[input.availability];
        breakdown.push({
            labelKey: 'WH40K.AcquisitionScale.Availability',
            value: availabilityValue,
        });
    } else {
        breakdown.push({ labelKey: 'WH40K.AcquisitionScale.Availability', value: 0 });
    }

    // 2. Craftsmanship.
    const craftKey: CraftsmanshipKey = input.craftsmanship ?? 'common';
    const craftValue = RT_CRAFTSMANSHIP_MODIFIERS[craftKey];
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

export const SCALE_KEYS_ORDERED: ReadonlyArray<ScaleKey> = ['negligible', 'trivial', 'minor', 'standard', 'major', 'significant', 'vast'];
