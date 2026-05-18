/**
 * Inventory generator — pure selection logic.
 *
 * Content-agnostic: this module never names a vendor, an armoury tier, a
 * weapon, or any other piece of compendium content. It operates only on plain
 * candidate projections handed to it by {@link InventoryGeneratorManager},
 * which reads them out of the compendium packs at runtime (Direction #7). All
 * randomness flows through an injected `rng` so stories and tests are
 * deterministic with a seeded generator.
 */

/** A single compendium item the generator may draw, projected to plain data. */
export interface InventoryCandidate {
    /** Foundry UUID: `Compendium.<packId>.<docType>.<id>`. */
    uuid: string;
    name: string;
    /** Item document type (`weapon`, `armour`, `gear`, …). */
    type: string;
    img: string;
    /** Rarity key from the shared schema (`common`, `rare`, …). Display only. */
    availability: string;
    /**
     * Relative draw weight from the item's homebrew tag. `null` (the schema
     * default) is treated as {@link DEFAULT_DRAW_WEIGHT} so untagged items are
     * still drawable at a baseline rate.
     */
    drawWeight: number | null;
    /** Generator profile tags this item is published under (content values). */
    profiles: readonly string[];
}

export interface GenerateOptions {
    /** Selected profile tag, or `null` / empty for "any profile". */
    profile: string | null;
    /** Number of distinct items to draw. Clamped to the pool size. */
    count: number;
    /** Deterministic RNG returning a float in [0, 1). */
    rng: () => number;
}

const DEFAULT_DRAW_WEIGHT = 1;

/**
 * Deterministic LCG. The same seed always yields the same draw sequence, so a
 * preview is stable across re-renders (it only changes on an explicit reroll)
 * and stories / tests are reproducible. Content-agnostic primitive.
 */
export function seededRng(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

/**
 * Distinct, locale-sorted profile tags present across the candidate pool.
 * This is how the UI populates its profile selector — the set is discovered
 * from compendium data, never hardcoded.
 */
export function collectProfiles(candidates: readonly InventoryCandidate[]): string[] {
    const set = new Set<string>();
    for (const candidate of candidates) {
        for (const profile of candidate.profiles) {
            const trimmed = profile.trim();
            if (trimmed.length > 0) set.add(trimmed);
        }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Candidates published under `profile`. An empty / null profile means "any",
 * which returns the whole pool unchanged.
 */
export function filterByProfile(candidates: readonly InventoryCandidate[], profile: string | null): InventoryCandidate[] {
    if (profile === null || profile.trim().length === 0) return [...candidates];
    return candidates.filter((candidate) => candidate.profiles.includes(profile));
}

/** Positive draw weight for a candidate, applying the default + sanitizing. */
export function effectiveWeight(candidate: InventoryCandidate): number {
    const weight = candidate.drawWeight;
    if (weight === null || !Number.isFinite(weight) || weight <= 0) return DEFAULT_DRAW_WEIGHT;
    return weight;
}

/**
 * Weighted random sample WITHOUT replacement. Returns up to `count` distinct
 * candidates; the probability of each remaining candidate being picked on a
 * given draw is proportional to its {@link effectiveWeight}. Pure — every
 * random decision comes from `rng`.
 */
export function weightedSample(pool: readonly InventoryCandidate[], count: number, rng: () => number): InventoryCandidate[] {
    const remaining = [...pool];
    const picked: InventoryCandidate[] = [];
    const target = Math.max(0, Math.min(Math.floor(count), remaining.length));

    for (let drawn = 0; drawn < target; drawn++) {
        let total = 0;
        for (const candidate of remaining) total += effectiveWeight(candidate);
        if (total <= 0) break;

        let roll = rng() * total;
        let chosenIndex = remaining.length - 1;
        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes the index access possibly undefined under strict TS, but eslint's plain rule disagrees
            if (candidate === undefined) continue;
            roll -= effectiveWeight(candidate);
            if (roll <= 0) {
                chosenIndex = i;
                break;
            }
        }

        const chosen = remaining.splice(chosenIndex, 1)[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes the array index access possibly undefined under strict TS, but eslint's plain rule disagrees
        if (chosen !== undefined) picked.push(chosen);
    }

    return picked;
}

/** Filter the pool to the selected profile, then weighted-sample `count`. */
export function generateInventory(candidates: readonly InventoryCandidate[], options: GenerateOptions): InventoryCandidate[] {
    const pool = filterByProfile(candidates, options.profile);
    return weightedSample(pool, options.count, options.rng);
}
