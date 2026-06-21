/**
 * @file threat-utils - Shared encounter-balance math for the NPC GM tools (#350).
 *
 * Both the difficulty calculator and the encounter builder derive a party-threat
 * figure and a difficulty verdict from the enemy-to-party threat ratio. Previously
 * each tool carried its own copy of the formula and its own difficulty-band table,
 * so a balance retune applied to one drifted from the other. This module is the
 * single source of truth for both: the party-threat formula and the canonical
 * difficulty-band table keyed by enemy-threat / party-threat ratio.
 */

/** Multiplier applied to (party count × average level) to yield party threat. */
const PARTY_THREAT_MULTIPLIER = 2;

/**
 * Compute the baseline party threat figure.
 * @param count - Number of party members.
 * @param averageLevel - Average party rank/level.
 * @returns The party threat (`count × averageLevel × 2`).
 */
export function calculatePartyThreat(count: number, averageLevel: number): number {
    return count * averageLevel * PARTY_THREAT_MULTIPLIER;
}

/** A single difficulty band, selected by the enemy-to-party threat ratio. */
export interface DifficultyBand {
    /** Upper bound (inclusive) on the threat ratio for this band; `Infinity` for the top band. */
    maxRatio: number;
    /** Localization key for the band's display label. */
    label: string;
    /** Hex colour used for the band's UI treatment. */
    color: string;
}

/** A difficulty band resolved for a ratio, carrying its lookup key. */
export interface ResolvedDifficultyBand extends DifficultyBand {
    key: string;
}

/**
 * Canonical difficulty bands, ascending by `maxRatio`. The ratio is
 * `total enemy threat / party threat`; the first band whose `maxRatio` the ratio
 * does not exceed is the verdict.
 */
export const DIFFICULTY_BANDS: Record<string, DifficultyBand> = {
    trivial: { maxRatio: 0.5, label: 'WH40K.Threat.Trivial', color: '#4ade80' },
    easy: { maxRatio: 0.8, label: 'WH40K.Threat.Low', color: '#84cc16' },
    moderate: { maxRatio: 1.2, label: 'WH40K.Threat.Moderate', color: '#facc15' },
    dangerous: { maxRatio: 1.6, label: 'WH40K.Threat.Dangerous', color: '#fb923c' },
    deadly: { maxRatio: 2.0, label: 'WH40K.Threat.Deadly', color: '#ef4444' },
    apocalyptic: { maxRatio: Infinity, label: 'WH40K.Threat.Apocalyptic', color: '#991b1b' },
};

/** Fallback for the top band when (defensively) no band matches. */
const APOCALYPTIC_FALLBACK: DifficultyBand = { maxRatio: Infinity, label: 'WH40K.Threat.Apocalyptic', color: '#991b1b' };

/**
 * Resolve the difficulty band for an enemy-to-party threat ratio.
 * @param ratio - `total enemy threat / party threat`.
 * @returns The matching band plus its key.
 */
export function difficultyForRatio(ratio: number): ResolvedDifficultyBand {
    for (const [key, band] of Object.entries(DIFFICULTY_BANDS)) {
        if (ratio <= band.maxRatio) {
            return { key, ...band };
        }
    }
    return { key: 'apocalyptic', ...(DIFFICULTY_BANDS['apocalyptic'] ?? APOCALYPTIC_FALLBACK) };
}
