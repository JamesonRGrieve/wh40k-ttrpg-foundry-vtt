/**
 * Canonical NPC threat-band table (#310).
 *
 * Single source for the threat-level → band mapping that had drifted across
 * four sites (`threat-calculator.ts` THREAT_TIERS + getTierInfo colors,
 * `npc.ts` threatDescription + threatTier, `quick-create-dialog.ts`). Lives
 * under `utils/` so the NPC DataModel can import it — DataModels may not import
 * `applications/` (dependency-cruiser `data-must-not-depend-on-applications`),
 * which is where the old colour/label tables lived.
 *
 * The five FFG-shared bands serve all seven game systems (homologation-positive).
 */

/** Stable threat-tier identifiers, lowest → highest. Internal — consumers reach these via inference on {@link tierBandFor}. */
type ThreatBandKey = 'minor' | 'standard' | 'tough' | 'elite' | 'boss';

/** A single threat band. `maxThreat` is the inclusive upper bound (∞ for the top band). */
interface ThreatBand {
    /** Stable tier key (minor/standard/tough/elite/boss). */
    readonly key: ThreatBandKey;
    /** Plain English label ("Minor") — used by the generator's tier name. */
    readonly label: string;
    /** In-world Latin label ("Hereticus Minoris") — shown on the NPC threat badge. */
    readonly latinLabel: string;
    /** Localization key for the prose threat description. */
    readonly descriptionKey: string;
    /** Hex swatch colour for the tier badge. */
    readonly color: string;
    /** Inclusive lower threat bound. */
    readonly minThreat: number;
    /** Inclusive upper threat bound (`Number.POSITIVE_INFINITY` for the top band). */
    readonly maxThreat: number;
}

/** The open-ended top band; also the {@link tierBandFor} fallback. */
const BOSS_BAND: ThreatBand = {
    key: 'boss',
    label: 'Boss',
    latinLabel: 'Hereticus Maximus',
    descriptionKey: 'WH40K.Threat.Apocalyptic',
    color: '#9c27b0',
    minThreat: 21,
    maxThreat: Number.POSITIVE_INFINITY,
};

/**
 * The canonical band table. Upper bounds reproduce the legacy
 * `level <= 5 / <= 10 / <= 15 / <= 20` cascade exactly, so boundary values
 * (5/10/15/20) land in the same band the four old sites produced.
 */
export const THREAT_BANDS: readonly ThreatBand[] = [
    { key: 'minor', label: 'Minor', latinLabel: 'Hereticus Minoris', descriptionKey: 'WH40K.Threat.Low', color: '#4caf50', minThreat: 1, maxThreat: 5 },
    {
        key: 'standard',
        label: 'Standard',
        latinLabel: 'Hereticus Medius',
        descriptionKey: 'WH40K.Threat.Moderate',
        color: '#2196f3',
        minThreat: 6,
        maxThreat: 10,
    },
    { key: 'tough', label: 'Tough', latinLabel: 'Hereticus Gravis', descriptionKey: 'WH40K.Threat.Dangerous', color: '#ff9800', minThreat: 11, maxThreat: 15 },
    { key: 'elite', label: 'Elite', latinLabel: 'Hereticus Extremis', descriptionKey: 'WH40K.Threat.Deadly', color: '#f44336', minThreat: 16, maxThreat: 20 },
    BOSS_BAND,
];

/**
 * Resolve the threat band for a level. Matches the legacy inclusive-upper
 * cascade: anything at or below the minor ceiling (including 0 / negative)
 * resolves to `minor`; anything above the elite ceiling resolves to `boss`.
 */
export function tierBandFor(level: number): ThreatBand {
    return THREAT_BANDS.find((band) => level <= band.maxThreat) ?? BOSS_BAND;
}
