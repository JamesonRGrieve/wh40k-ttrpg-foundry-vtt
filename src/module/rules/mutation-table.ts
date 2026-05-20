/**
 * Mutation Table (core.md §"Mutation" / Table 8–16, p. 291–292).
 *
 * When a character fails a Malignancy Test (#67) and crosses into a
 * Mutation threshold, the GM rolls 1d100 on Table 8–16 and applies the
 * resulting mutation. Mutations have mechanical riders (traits, stat
 * shifts, custom on-damage effects) and a flag indicating whether the
 * mutation is outwardly visible — invisible mutations only manifest
 * through the rider, while visible ones permanently mark the character.
 *
 * Tracks: a Minor mutation roll biases the d100 toward the lower rows
 * (mostly physical, less severe); a Major roll biases toward the upper
 * rows (warp-touched, daemonic, world-ending). Both tracks share the
 * same registry — the track only controls the random sample range.
 *
 * The registry holds 10 canonical sample entries spanning the RAW
 * table (Bestial Hide → The Warp Made Manifest). It is not exhaustive
 * of the 19-row source table; the GM can hand-pick any entry via the
 * dialog when the roll outcome is undesirable for narrative reasons.
 *
 * See GitHub issue #117.
 */

export type MutationTrack = 'minor' | 'major';

export interface MutationDef {
    /** Stable identifier used for ActiveEffect / sheet-flag wiring later. */
    readonly id: string;
    /** Display name (player-facing once revealed). */
    readonly name: string;
    /** d100 roll range on Table 8–16 that produces this mutation. */
    readonly roll: { readonly min: number; readonly max: number };
    /** Whether the mutation is outwardly visible (false = hidden/internal). */
    readonly visible: boolean;
    /** Mechanical effect summary — prose, expanded in chat / sheet. */
    readonly effect: string;
    /**
     * Which track this entry is reachable on. Most entries are 'both',
     * but some (e.g., The Warp Made Manifest) are major-only because
     * the roll range overlaps only the upper band.
     */
    readonly tracks: ReadonlyArray<MutationTrack>;
}

/**
 * Subset of Table 8–16 used by the dispatcher. Roll ranges follow RAW.
 * Order matches the d100 sweep low → high.
 */
export const MUTATION_TABLE: ReadonlyArray<MutationDef> = [
    {
        id: 'bestial-hide',
        name: 'Bestial Hide',
        roll: { min: 1, max: 6 },
        visible: true,
        effect: "The character's skin becomes toughened with layers of thick scales or chitin, granting the Natural Armour (2) trait.",
        tracks: ['minor', 'major'],
    },
    {
        id: 'unnatural-arms',
        name: 'Unnatural Arms',
        roll: { min: 7, max: 11 },
        visible: true,
        effect: 'Twisted appendages emerge from the spine or torso, granting the Multiple Arms (CB) trait.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'sightless-orbs',
        name: 'Sightless Orbs',
        roll: { min: 12, max: 17 },
        visible: true,
        effect: 'Eyes become sightless, cracked windows into a corrupted soul. The character gains the Blind and Unnatural Senses (CB×10) traits.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'swollen-brute',
        name: 'Swollen Brute',
        roll: { min: 18, max: 25 },
        visible: true,
        effect: 'Muscles expand grotesquely. Toughness and Strength are permanently increased by 10, but Agility bonus drops by 1 for movement purposes.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'deathsight',
        name: 'Deathsight',
        roll: { min: 26, max: 30 },
        visible: false,
        effect: 'Once per session, the character may add their Corruption bonus to the damage of a single attack. Doing so inflicts 1 Corruption.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'razor-fangs',
        name: 'Razor Fangs',
        roll: { min: 37, max: 43 },
        visible: true,
        effect: 'Teeth turn into tearing fangs: an unarmed attack inflicts 1d5+CB Rending damage, Pen 2. Fellowship is permanently reduced by 1d5.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'wings',
        name: 'Wings',
        roll: { min: 50, max: 54 },
        visible: true,
        effect: 'Massive feathered or leathery wings erupt from the spine, granting the Flyer (CB×2) trait.',
        tracks: ['minor', 'major'],
    },
    {
        id: 'witch-curse',
        name: 'Witch-Curse',
        roll: { min: 70, max: 77 },
        visible: false,
        effect: 'A maddening rune marks the character. They gain the Psyker trait (or +1 psy rating) and one psychic power of 100 xp or less. Using it gains 1d5 Corruption.',
        tracks: ['major'],
    },
    {
        id: 'corrupted-flesh',
        name: 'Corrupted Flesh',
        roll: { min: 90, max: 92 },
        visible: false,
        effect: 'When the character is wounded, insects and worms spill from the cut. They gain the Fear (1) trait for 1d5 rounds after suffering damage.',
        tracks: ['major'],
    },
    {
        id: 'warp-made-manifest',
        name: 'The Warp Made Manifest',
        roll: { min: 100, max: 100 },
        visible: true,
        effect: 'The character becomes Daemon-like, gaining Daemonic (CB), Fear (2), From Beyond, and Warp Instability. They may substitute Willpower for any other characteristic on any test.',
        tracks: ['major'],
    },
];

/** Track-specific d100 ranges. Minor biases low; Major spans the full table but is intended for high CP characters. */
export const TRACK_RANGES: Readonly<Record<MutationTrack, { readonly min: number; readonly max: number }>> = {
    minor: { min: 1, max: 54 },
    major: { min: 1, max: 100 },
};

/** Optional injectable RNG so tests and stories can pin the roll. */
export type RollD100 = () => number;

const defaultRng: RollD100 = () => Math.floor(Math.random() * 100) + 1;

/** Look up the mutation that owns the given d100 roll on the given track. */
export function findMutationByRoll(roll: number, track: MutationTrack): MutationDef | null {
    const r = Math.max(1, Math.min(100, Math.trunc(roll)));
    for (const m of MUTATION_TABLE) {
        if (r >= m.roll.min && r <= m.roll.max && m.tracks.includes(track)) {
            return m;
        }
    }
    return null;
}

export interface MutationRollResult {
    readonly track: MutationTrack;
    readonly roll: number;
    readonly mutation: MutationDef | null;
}

/**
 * Roll on the mutation table for the given track. The roll is clamped
 * to the track's range; if the resulting d100 doesn't land on a defined
 * row (the RAW table has gaps in this subset), `mutation` is null and
 * the caller is expected to re-roll or hand-pick.
 */
export function rollMutation(track: MutationTrack, rng: RollD100 = defaultRng): MutationRollResult {
    const range = TRACK_RANGES[track];
    const raw = Math.floor(rng());
    const clamped = Math.max(range.min, Math.min(range.max, raw));
    return {
        track,
        roll: clamped,
        mutation: findMutationByRoll(clamped, track),
    };
}

/** Convenience: pick a mutation by id (used by the dialog when the GM hand-selects). */
export function getMutationById(id: string): MutationDef | null {
    return MUTATION_TABLE.find((m) => m.id === id) ?? null;
}
