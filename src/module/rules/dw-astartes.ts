/**
 * Deathwatch Astartes baseline (#167 — Deathwatch core.md "The
 * Adeptus Astartes" / "Implants of the Astartes" / "Black Carapace").
 *
 * Pure-rules engine for the always-on traits every Battle-Brother
 * carries:
 *
 *   - Unnatural Strength (×2) and Unnatural Toughness (×2) — the
 *     Astartes gene-seed implants Ossmodula, Biscopea, and Haemastamen
 *     leave every Space Marine with these two traits. Per RAW, an
 *     Unnatural Characteristic of ×N multiplies the Characteristic
 *     Bonus (SB / TB) by N for the purposes of rolls and absorbing
 *     damage. We don't model the trait *itself* here — only the
 *     scalar arithmetic — because DataModels own where in the stat
 *     stack the multiplier is applied.
 *
 *   - The 19 canonical Astartes implants. We expose them as an enum
 *     of identifiers plus a registry that classifies each one by the
 *     *kind* of mechanical effect it grants (auto-heal, immunity to
 *     poison, enhanced senses, environmental adaptation, gene-seed,
 *     power-armour interface). Per Direction #7, specific stat-block
 *     deltas (durations, bonuses, thresholds) live in compendium
 *     content — not in this file. The `description` strings here
 *     are inline English fallbacks for code paths that need a label
 *     before the compendium has resolved; the UI layer resolves
 *     `WH40K.DW.Astartes.Implant.<Id>.Name` from the langpack.
 *
 *   - The Black Carapace's interface property: Astartes power armour
 *     incurs the usual encumbrance / penalty rules for power armour
 *     UNLESS the wearer has the Black Carapace implant, at which
 *     point the suit becomes a second skin and those penalties do
 *     not apply. Non-Astartes wearing Astartes power armour still
 *     take the standard penalties (lacking the carapace), and an
 *     Astartes wearing non-Astartes armour gains no benefit (the
 *     carapace specifically interfaces with Astartes-pattern PA).
 */

/** Canonical Astartes implant identifiers, kebab-cased. */
export type AstartesImplantId =
    | 'secondary-heart'
    | 'ossmodula'
    | 'biscopea'
    | 'haemastamen'
    | 'larramans-organ'
    | 'catalepsean-node'
    | 'preomnor'
    | 'omophagea'
    | 'multi-lung'
    | 'occulobe'
    | 'lymans-ear'
    | 'sus-an-membrane'
    | 'melanchromic-organ'
    | 'oolitic-kidney'
    | 'neuroglottis'
    | 'mucranoid'
    | 'betchers-gland'
    | 'progenoids'
    | 'black-carapace';

/**
 * Content-agnostic enum of mechanical effect categories. Specific
 * deltas / durations / thresholds live in compendium content (Direction
 * #7); this enum just labels *what kind* of effect each implant
 * produces so consumers can dispatch on it.
 *
 *   - `auto-heal`: accelerated wound closure / clotting.
 *   - `immune-poison`: immunity (or strong resistance) to ingested or
 *     bloodstream toxins.
 *   - `immune-suspended-animation`: entry into a healing torpor that
 *     prevents death by trauma (Sus-an Membrane RAW).
 *   - `enhanced-vision` / `-hearing` / `-smell` / `-taste`: sensory
 *     organ effects (Occulobe, Lyman's Ear, Neuroglottis, Omophagea).
 *   - `environmental`: adaptation to hostile environments — vacuum,
 *     toxic atmospheres, extreme cold (Multi-lung, Mucranoid,
 *     Melanchromic Organ, Oolitic Kidney).
 *   - `spit-acid`: weaponised gland (Betcher's Gland).
 *   - `gene-seed-organ`: the implant that stores / propagates the
 *     gene-seed itself (Progenoids).
 *   - `power-armor-interface`: neural interface with Astartes power
 *     armour (Black Carapace).
 */
export type ImplantMechanicCategory =
    | 'auto-heal'
    | 'immune-poison'
    | 'immune-suspended-animation'
    | 'enhanced-vision'
    | 'enhanced-hearing'
    | 'enhanced-smell'
    | 'enhanced-taste'
    | 'environmental'
    | 'spit-acid'
    | 'gene-seed-organ'
    | 'power-armor-interface';

/**
 * A single implant's content-agnostic effect description. `mechanic`
 * tags the kind of effect the implant produces (so consumers can
 * dispatch on the category); `description` is the inline English
 * fallback used when the langpack key has not been resolved.
 */
export interface ImplantMechanicalEffect {
    id: AstartesImplantId;
    description: string;
    /**
     * Some implants (Ossmodula, Biscopea, Haemastamen) feed directly
     * into the baseline Unnatural Str/Toughness multipliers rather
     * than producing a discrete mechanic. Those omit `mechanic`.
     */
    mechanic?: ImplantMechanicCategory;
}

/** The 19 canonical Astartes implants, in implant-table order. */
export const ASTARTES_IMPLANTS: ReadonlyArray<AstartesImplantId> = [
    'secondary-heart',
    'ossmodula',
    'biscopea',
    'haemastamen',
    'larramans-organ',
    'catalepsean-node',
    'preomnor',
    'omophagea',
    'multi-lung',
    'occulobe',
    'lymans-ear',
    'sus-an-membrane',
    'melanchromic-organ',
    'oolitic-kidney',
    'neuroglottis',
    'mucranoid',
    'betchers-gland',
    'progenoids',
    'black-carapace',
];

/**
 * Registry of Astartes implants → content-agnostic mechanical
 * classification. Descriptions are short English fallbacks; the
 * langpack carries the player-facing names at
 * `WH40K.DW.Astartes.Implant.<Id>.Name`.
 */
export const IMPLANT_EFFECTS: Record<AstartesImplantId, ImplantMechanicalEffect> = {
    'secondary-heart': {
        id: 'secondary-heart',
        description:
            'A second heart that boosts circulation, letting the Astartes function at peak in low-oxygen environments and recover from exertion faster.',
        mechanic: 'environmental',
    },
    'ossmodula': {
        id: 'ossmodula',
        description: 'Endocrine organ that fuses and thickens the skeleton, feeding into the Astartes Unnatural Strength baseline.',
    },
    'biscopea': {
        id: 'biscopea',
        description: 'Chest implant that stimulates muscle growth, feeding into the Astartes Unnatural Strength baseline.',
    },
    'haemastamen': {
        id: 'haemastamen',
        description: 'Blood-oxygenation organ that transforms the circulatory system, feeding into the Astartes Unnatural Toughness baseline.',
    },
    'larramans-organ': {
        id: 'larramans-organ',
        description: 'Liver-adjacent organ that produces Larraman cells, sealing wounds with near-instant scar tissue.',
        mechanic: 'auto-heal',
    },
    'catalepsean-node': {
        id: 'catalepsean-node',
        description: 'Brain implant that lets the Astartes rest half their mind at a time, remaining alert through long vigils without sleep.',
        mechanic: 'environmental',
    },
    'preomnor': {
        id: 'preomnor',
        description: 'Pre-stomach that neutralises poisons and indigestible matter before food reaches the true stomach.',
        mechanic: 'immune-poison',
    },
    'omophagea': {
        id: 'omophagea',
        description: "Spinal implant that lets the Astartes 'learn by eating' — extracting memory from consumed flesh.",
        mechanic: 'enhanced-taste',
    },
    'multi-lung': {
        id: 'multi-lung',
        description: 'Third lung that lets the Astartes breathe in tainted or low-oxygen atmospheres and survive briefly under water.',
        mechanic: 'environmental',
    },
    'occulobe': {
        id: 'occulobe',
        description: 'Retinal implant granting low-light vision and fine control over pupil dilation.',
        mechanic: 'enhanced-vision',
    },
    'lymans-ear': {
        id: 'lymans-ear',
        description: 'Replacement inner ear granting acute hearing and resistance to disorientation.',
        mechanic: 'enhanced-hearing',
    },
    'sus-an-membrane': {
        id: 'sus-an-membrane',
        description: 'Brain membrane that triggers a healing suspended-animation state when the Astartes would otherwise die of trauma.',
        mechanic: 'immune-suspended-animation',
    },
    'melanchromic-organ': {
        id: 'melanchromic-organ',
        description: 'Skin-pigment organ that darkens skin to shield against radiation and intense light.',
        mechanic: 'environmental',
    },
    'oolitic-kidney': {
        id: 'oolitic-kidney',
        description: 'Auxiliary kidney that filters bloodborne toxins and lets the Astartes purge poisons via the multi-lung.',
        mechanic: 'immune-poison',
    },
    'neuroglottis': {
        id: 'neuroglottis',
        description: 'Tasting organ implanted in the mouth that identifies substances by chemical signature, including poisons and tracked prey.',
        mechanic: 'enhanced-smell',
    },
    'mucranoid': {
        id: 'mucranoid',
        description: 'Gland that secretes a protective wax across the skin, sealing the Astartes against vacuum and extreme cold.',
        mechanic: 'environmental',
    },
    'betchers-gland': {
        id: 'betchers-gland',
        description: 'Salivary glands that produce a corrosive, blinding acid the Astartes can spit as a weapon.',
        mechanic: 'spit-acid',
    },
    'progenoids': {
        id: 'progenoids',
        description: 'Twin gene-seed organs (neck and chest) that ripen into the next generation of implants for the Chapter.',
        mechanic: 'gene-seed-organ',
    },
    'black-carapace': {
        id: 'black-carapace',
        description: 'Subdermal interface layer beneath the skin that connects directly to Astartes power armour, letting the suit move as a second skin.',
        mechanic: 'power-armor-interface',
    },
};

/** Astartes Unnatural Strength multiplier — RAW ×2. */
export const UNNATURAL_STRENGTH_MULTIPLIER = 2;

/** Astartes Unnatural Toughness multiplier — RAW ×2. */
export const UNNATURAL_TOUGHNESS_MULTIPLIER = 2;

/**
 * Floor a value at zero. Unnatural Characteristic bonuses cannot go
 * negative — a Marine with negative-bonus Strength has bigger problems
 * than the multiplier introduces.
 */
function clampNonNegative(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value;
}

/**
 * Apply the Astartes Unnatural Strength ×2 multiplier to a raw
 * Strength Bonus (SB). Returns the doubled SB, floored at zero.
 */
export function astartesStrengthBonus(strengthBonus: number): number {
    return clampNonNegative(strengthBonus) * UNNATURAL_STRENGTH_MULTIPLIER;
}

/**
 * Apply the Astartes Unnatural Toughness ×2 multiplier to a raw
 * Toughness Bonus (TB). Returns the doubled TB, floored at zero.
 */
export function astartesToughnessBonus(toughnessBonus: number): number {
    return clampNonNegative(toughnessBonus) * UNNATURAL_TOUGHNESS_MULTIPLIER;
}

/** True iff the given implant set contains the Black Carapace. */
export function hasBlackCarapace(implants: ReadonlyArray<AstartesImplantId>): boolean {
    return implants.includes('black-carapace');
}

/**
 * Arguments to {@link powerArmorInterfaceActive}. Both signals must
 * be true for the carapace's "no encumbrance penalty" effect to fire:
 * the implant must be present *and* the actor must actually be wearing
 * Astartes-pattern power armour.
 */
export interface PowerArmorInterfaceArgs {
    implants: ReadonlyArray<AstartesImplantId>;
    wearingAstartesPowerArmor: boolean;
}

/**
 * The Black Carapace cancels the encumbrance / agility penalty
 * Astartes power armour would otherwise impose. Returns true iff the
 * wearer has the Black Carapace implant AND is wearing Astartes-pattern
 * power armour. The caller (armour DataModel / sheet) uses this flag
 * to skip applying the standard PA penalty.
 */
export function powerArmorInterfaceActive(args: PowerArmorInterfaceArgs): boolean {
    return args.wearingAstartesPowerArmor && hasBlackCarapace(args.implants);
}
