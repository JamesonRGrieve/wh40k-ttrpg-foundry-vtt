/**
 * Pure aptitude-derivation logic for the origin path (#381).
 *
 * Aptitudes are 1:1 with the origin path: every origin item (home world /
 * background / role / elite / divination) carries `grants.aptitudes` plus
 * resolved `grants.choices[type=aptitude]` picks. The ONLY part that cannot be
 * derived is the player's elective pick when the origin would grant the same
 * aptitude twice ("double-up", DH2 Core p.79). These helpers compute the set,
 * count double-ups, validate the electives, and recover legacy electives during
 * migration.
 *
 * Foundry-free (no DataModel / `foundry.*` at module load), so it is directly
 * unit-testable and importable by both the origin-path item DataModel and the
 * character actor DataModel without dragging in the heavy class cascade — the
 * same split `origin-step-names.ts` / `origin-choices.ts` use.
 */

import { type SelectedChoices, iterateResolvedChoices } from '../../utils/origin-choices.ts';

/**
 * The nine Characteristic aptitudes (DH2 Core p.79). When the origin path would
 * grant the same aptitude twice ("double-up"), the player must instead pick one
 * of these — an aptitude they do not already have. These are the ONLY valid
 * elective double-up picks. Content-agnostic mechanic primitive (the nine
 * characteristic identities are a fixed RAW axis, not per-pack content), so it
 * lives in code rather than a compendium document (Direction #7).
 */
export const CHARACTERISTIC_APTITUDES: readonly string[] = [
    'Weapon Skill',
    'Ballistic Skill',
    'Strength',
    'Toughness',
    'Agility',
    'Intelligence',
    'Perception',
    'Willpower',
    'Fellowship',
];

/**
 * Canonical identity for aptitude membership / equality comparison. Aptitude
 * grants are authored across many independent compendium documents, so the same
 * aptitude can appear with incidental case / whitespace variance ("Willpower",
 * "willpower", " Willpower "). Comparisons key on this identity; display strings
 * are preserved separately. Mirrors `OriginPathBuilder._normalizeAptitudeIdentity`.
 */
export function aptitudeIdentity(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Minimal structural view of one origin item's `grants` block for aptitude collection. */
export interface AptitudeGrantSource {
    // eslint-disable-next-line no-restricted-syntax -- boundary: origin-path `grants` is heterogeneous untyped JSON from the DataModel; `aptitudes` is narrowed (Array.isArray + string filter) before use
    aptitudes?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: origin-path `grants` is heterogeneous untyped JSON from the DataModel; `choices` is narrowed before use
    choices?: unknown;
}

/** Structural view of an aptitude-typed grant choice (a superset matched by {@link iterateResolvedChoices}). */
interface AptitudeChoice {
    type?: string;
    label?: string;
    name?: string;
    options?: ReadonlyArray<{ value?: string; name?: string; label?: string }>;
}

/**
 * The aptitudes a single origin item grants — fixed `grants.aptitudes` plus
 * resolved `grants.choices[type=aptitude]` picks — deduplicated WITHIN that item
 * (so one origin granting an aptitude twice counts once). Cross-origin
 * duplicates are preserved by the caller concatenating per-item results; that is
 * what drives the double-up count. Returns literal display names. Mirrors the
 * builder's `_selectionGrantedAptitudes` so the two surfaces agree on "what does
 * this origin grant".
 */
export function collectGrantedAptitudes(grants: AptitudeGrantSource | undefined, selectedChoices: SelectedChoices | undefined): string[] {
    if (grants === undefined) return [];
    const perItem: string[] = [];
    const seen = new Set<string>();
    const add = (name: string): void => {
        const trimmed = name.trim();
        if (trimmed === '') return;
        const key = aptitudeIdentity(trimmed);
        if (seen.has(key)) return;
        seen.add(key);
        perItem.push(trimmed);
    };

    if (Array.isArray(grants.aptitudes)) {
        for (const apt of grants.aptitudes) if (typeof apt === 'string') add(apt);
    }

    const choices: AptitudeChoice[] = Array.isArray(grants.choices) ? (grants.choices as AptitudeChoice[]) : [];
    for (const { choice, selectedValues, resolveOption } of iterateResolvedChoices<AptitudeChoice>(choices, selectedChoices ?? {})) {
        if (choice.type !== 'aptitude') continue;
        for (const selected of selectedValues) {
            const option = resolveOption(selected);
            const aptName = (option?.value !== undefined && option.value !== '' ? option.value : option?.name) ?? selected;
            add(aptName);
        }
    }
    return perItem;
}

/** Result of deriving the aptitude set from origin grants + the player's elective picks. */
export interface AptitudeDerivation {
    /** Unique origin-granted aptitudes (order-preserving). Excludes the universal General aptitude, which consumers inject separately. */
    computed: string[];
    /** Number of duplicate grants across the origin path — the count of double-ups the player must resolve. */
    doubleUpCount: number;
    /** Electives that pass validation and are folded into the final set. */
    appliedElectives: string[];
    /** Electives that fail validation (not a Characteristic aptitude, already granted, or a repeat). */
    invalidElectives: string[];
    /** Final aptitude set used for XP costs: `computed` ∪ `appliedElectives`. */
    aptitudes: string[];
    /** True only when there is exactly one valid Characteristic elective per double-up, none invalid. */
    isValid: boolean;
}

/**
 * Derive the actor's aptitude set from the flattened list of origin grants and
 * the player's stored elective double-up picks (DH2 Core p.79).
 *
 * - `computed` is the de-duplicated grant set; `doubleUpCount` is how many grants
 *   collapsed (i.e. how many electives the player owes).
 * - An elective is valid only when it is one of {@link CHARACTERISTIC_APTITUDES},
 *   is not already in `computed`, and is not repeated among the electives.
 * - `aptitudes` is `computed` ∪ the valid electives. The General universal
 *   aptitude is NOT added here — it is injected at consumer time
 *   (`AptitudeBasedSystemConfig.universalAptitudes`) so the stored/derived set
 *   stays origin-faithful and the pill source attribution keeps one source of
 *   truth.
 *
 * Pure and homologation-neutral: it operates on string lists only, so every
 * game system that uses aptitudes (DH2e/BC/OW/IM/DH1-errata/DW) shares it.
 */
export function deriveAptitudes(grantedAptitudes: readonly string[], electives: readonly string[]): AptitudeDerivation {
    const computed: string[] = [];
    const computedKeys = new Set<string>();
    let grantedCount = 0;
    for (const raw of grantedAptitudes) {
        const name = raw.trim();
        if (name === '') continue;
        grantedCount++;
        const key = aptitudeIdentity(name);
        if (!computedKeys.has(key)) {
            computedKeys.add(key);
            computed.push(name);
        }
    }
    const doubleUpCount = grantedCount - computed.length;

    const characteristicKeys = new Set(CHARACTERISTIC_APTITUDES.map(aptitudeIdentity));
    const appliedElectives: string[] = [];
    const appliedKeys = new Set<string>();
    const invalidElectives: string[] = [];
    for (const raw of electives) {
        const name = raw.trim();
        if (name === '') continue;
        const key = aptitudeIdentity(name);
        const valid = characteristicKeys.has(key) && !computedKeys.has(key) && !appliedKeys.has(key);
        if (valid) {
            appliedKeys.add(key);
            appliedElectives.push(name);
        } else {
            invalidElectives.push(name);
        }
    }

    const aptitudes = [...computed, ...appliedElectives];
    const isValid = invalidElectives.length === 0 && appliedElectives.length === doubleUpCount;

    return { computed, doubleUpCount, appliedElectives, invalidElectives, aptitudes, isValid };
}

/**
 * Migration helper: recover the player's elective double-up picks from a legacy
 * actor that stored its full aptitude array on `system.aptitudes`.
 *
 * An elective is a Characteristic aptitude the player chose to resolve a
 * double-up — by definition it is NOT one the origin path grants. So the legacy
 * electives are exactly the stored entries that (a) are Characteristic aptitudes
 * and (b) are not in the origin-derived `computed` set. Everything else in the
 * stored array was redundant with the computed set (or was a non-Characteristic
 * hand-write that the origin grant now reproduces) and is dropped, fulfilling
 * the "stop storing the full array" half of the migration. Deduplicated by
 * identity. (#381: reproduces A.Z.→Agility / Gus→Ballistic Skill as electives
 * while Ibnad→Fieldcraft falls back to the computed grant.)
 */
export function extractLegacyElectives(storedAptitudes: readonly string[], computed: readonly string[]): string[] {
    const computedKeys = new Set(computed.map(aptitudeIdentity));
    const characteristicKeys = new Set(CHARACTERISTIC_APTITUDES.map(aptitudeIdentity));
    const electives: string[] = [];
    const seen = new Set<string>();
    for (const raw of storedAptitudes) {
        const name = raw.trim();
        if (name === '') continue;
        const key = aptitudeIdentity(name);
        if (!characteristicKeys.has(key) || computedKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        electives.push(name);
    }
    return electives;
}
