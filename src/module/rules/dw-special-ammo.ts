/**
 * Deathwatch · Special-Issue Ammunition (#172 — DW core.md §"WEAPONS"
 * / Special Issue Ammunition, line ~6006).
 *
 * Pure rules / math layer. Deathwatch Astartes draw on the Adeptus
 * Mechanicus' specialist armouries to fit their bolters with one of
 * seven Special-Issue ammunition types. Each ammunition kind imposes a
 * RAW-fixed mechanical adjustment on the weapon's damage, penetration,
 * burst behaviour, reliability, or auxiliary effects (cover, energy
 * fields, stealth, fire damage).
 *
 * Per Direction #7 the consumer (weapon-attack pipeline, attack-roll
 * prompt, chat-card renderer) reads the loaded ammo id off the owned
 * weapon item and walks this registry; the engine has no Foundry /
 * Document coupling, no RNG, and no I/O.
 *
 * RAW summary:
 *   - Hellfire: +1d10 damage against unarmored targets only.
 *   - Kraken: +3 Penetration.
 *   - Metal Storm: +1 hit per Degree of Success on the attack test.
 *   - Tempest: ignores energy fields (Refractor / Conversion / etc.).
 *   - Stalker: silent / no muzzle flash, +10 to Stealth tests.
 *   - Vengeance: jams more readily (-1 Reliability shift) and adds
 *     +2 flat damage.
 *   - Dragonfire: ignores cover and adds +1d10 Fire damage.
 */

/* -------------------------------------------------------------------- */
/*  Ammunition identifiers                                              */
/* -------------------------------------------------------------------- */

/** Stable identifier for each Deathwatch Special-Issue ammunition type. */
export type DwSpecialAmmoId = 'hellfire' | 'kraken' | 'metal-storm' | 'tempest' | 'stalker' | 'vengeance' | 'dragonfire';

/** Stable iteration order for chat / sheet rendering. */
export const DW_SPECIAL_AMMO_IDS: ReadonlyArray<DwSpecialAmmoId> = Object.freeze([
    'hellfire',
    'kraken',
    'metal-storm',
    'tempest',
    'stalker',
    'vengeance',
    'dragonfire',
]);

/* -------------------------------------------------------------------- */
/*  Effect shape                                                        */
/* -------------------------------------------------------------------- */

/**
 * Mechanical effect of a Deathwatch Special-Issue ammunition kind on a
 * single attack.
 *
 *   - `bonusDamageDice`: extra d10s rolled and added to the weapon's
 *     damage. Hellfire and Dragonfire each add 1.
 *   - `bonusFlatDamage`: flat damage added to the weapon's roll.
 *     Vengeance adds +2.
 *   - `bonusPenetration`: flat Penetration added on top of the
 *     weapon's intrinsic Pen. Kraken adds +3.
 *   - `bonusHitsPerDoS`: extra hits scored per Degree of Success on
 *     the attack test. Metal Storm grants +1.
 *   - `ignoresEnergyFields`: when true, the hit bypasses Refractor /
 *     Conversion / Power-field protection entirely. Tempest sets this.
 *   - `ignoresCover`: when true, the target's cover AP is ignored for
 *     the hit. Dragonfire sets this.
 *   - `reliabilityShift`: integer shift to the weapon's reliability
 *     class. -1 means "jams more readily" (Vengeance); +1 would mean
 *     "more reliable" (none in RAW).
 *   - `stealthBonus`: flat modifier to Stealth tests made on the
 *     turn the weapon is fired. Stalker grants +10.
 *   - `fireDamage`: when true, the hit's damage is typed as Fire (or
 *     Energy w/ Fire keyword) for resistances and Igniter purposes.
 *     Dragonfire sets this.
 *   - `conditionalUnarmored`: when true, the dice / flat / penetration
 *     bonuses ONLY apply if the target is unarmored. Hellfire sets
 *     this; consumers must pass `targetUnarmored: true` to materialise
 *     the bonuses.
 */
export interface AmmoEffect {
    readonly id: DwSpecialAmmoId;
    readonly bonusDamageDice: number;
    readonly bonusFlatDamage: number;
    readonly bonusPenetration: number;
    readonly bonusHitsPerDoS: number;
    readonly ignoresEnergyFields: boolean;
    readonly ignoresCover: boolean;
    readonly reliabilityShift: number;
    readonly stealthBonus: number;
    readonly fireDamage: boolean;
    readonly conditionalUnarmored?: boolean;
}

/* -------------------------------------------------------------------- */
/*  Static effect table                                                 */
/* -------------------------------------------------------------------- */

/**
 * RAW values for every Deathwatch Special-Issue ammunition type
 * (DW core.md §"WEAPONS", line ~6006). Frozen singletons; callers
 * must not mutate.
 */
export const DW_SPECIAL_AMMO_EFFECTS: Readonly<Record<DwSpecialAmmoId, AmmoEffect>> = Object.freeze({
    'hellfire': Object.freeze({
        id: 'hellfire',
        bonusDamageDice: 1,
        bonusFlatDamage: 0,
        bonusPenetration: 0,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: false,
        ignoresCover: false,
        reliabilityShift: 0,
        stealthBonus: 0,
        fireDamage: false,
        conditionalUnarmored: true,
    }),
    'kraken': Object.freeze({
        id: 'kraken',
        bonusDamageDice: 0,
        bonusFlatDamage: 0,
        bonusPenetration: 3,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: false,
        ignoresCover: false,
        reliabilityShift: 0,
        stealthBonus: 0,
        fireDamage: false,
    }),
    'metal-storm': Object.freeze({
        id: 'metal-storm',
        bonusDamageDice: 0,
        bonusFlatDamage: 0,
        bonusPenetration: 0,
        bonusHitsPerDoS: 1,
        ignoresEnergyFields: false,
        ignoresCover: false,
        reliabilityShift: 0,
        stealthBonus: 0,
        fireDamage: false,
    }),
    'tempest': Object.freeze({
        id: 'tempest',
        bonusDamageDice: 0,
        bonusFlatDamage: 0,
        bonusPenetration: 0,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: true,
        ignoresCover: false,
        reliabilityShift: 0,
        stealthBonus: 0,
        fireDamage: false,
    }),
    'stalker': Object.freeze({
        id: 'stalker',
        bonusDamageDice: 0,
        bonusFlatDamage: 0,
        bonusPenetration: 0,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: false,
        ignoresCover: false,
        reliabilityShift: 0,
        stealthBonus: 10,
        fireDamage: false,
    }),
    'vengeance': Object.freeze({
        id: 'vengeance',
        bonusDamageDice: 0,
        bonusFlatDamage: 2,
        bonusPenetration: 0,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: false,
        ignoresCover: false,
        reliabilityShift: -1,
        stealthBonus: 0,
        fireDamage: false,
    }),
    'dragonfire': Object.freeze({
        id: 'dragonfire',
        bonusDamageDice: 1,
        bonusFlatDamage: 0,
        bonusPenetration: 0,
        bonusHitsPerDoS: 0,
        ignoresEnergyFields: false,
        ignoresCover: true,
        reliabilityShift: 0,
        stealthBonus: 0,
        fireDamage: true,
    }),
});

/* -------------------------------------------------------------------- */
/*  Lookup helpers                                                      */
/* -------------------------------------------------------------------- */

/**
 * Resolve the {@link AmmoEffect} for a given Special-Issue ammunition
 * id. Returned object is the frozen singleton from
 * {@link DW_SPECIAL_AMMO_EFFECTS}; callers must not mutate.
 */
export function getAmmoEffect(id: DwSpecialAmmoId): AmmoEffect {
    return DW_SPECIAL_AMMO_EFFECTS[id];
}

/* -------------------------------------------------------------------- */
/*  Application                                                         */
/* -------------------------------------------------------------------- */

/** Context for resolving an ammunition effect against a specific shot. */
export interface ApplyAmmoEffectInput {
    /** Weapon's base damage formula dice count (informational, unused by math). */
    readonly baseDamage: number;
    /** Weapon's base Penetration (informational, unused by math). */
    readonly basePenetration: number;
    /** Which Special-Issue type is loaded. */
    readonly ammoId: DwSpecialAmmoId;
    /** Whether the target has no armour (drives `conditionalUnarmored`). */
    readonly targetUnarmored?: boolean;
}

/** Resolved per-shot adjustments after honoring conditional flags. */
export interface AppliedAmmoEffect {
    readonly effectiveDamageDiceBonus: number;
    readonly effectiveFlatDamageBonus: number;
    readonly effectivePenetrationBonus: number;
    readonly bonusHitsPerDoS: number;
    readonly ignoresCover: boolean;
    readonly ignoresEnergyFields: boolean;
    readonly reliabilityShift: number;
    readonly stealthBonus: number;
    readonly fireDamage: boolean;
}

/**
 * Resolve an ammunition effect into the per-shot numeric adjustments,
 * honouring any conditional gates (e.g. Hellfire only contributes its
 * damage bonus against unarmored targets).
 *
 * The base damage / base penetration inputs are accepted for symmetry
 * with the call-site shape but are not consumed by the math layer;
 * the caller already owns the base values and merely needs the
 * additive deltas.
 */
export function applyAmmoEffect(input: ApplyAmmoEffectInput): AppliedAmmoEffect {
    const effect = getAmmoEffect(input.ammoId);
    const targetUnarmored = input.targetUnarmored === true;
    const conditional = effect.conditionalUnarmored === true;
    const conditionalGateOpen = !conditional || targetUnarmored;

    return {
        effectiveDamageDiceBonus: conditionalGateOpen ? effect.bonusDamageDice : 0,
        effectiveFlatDamageBonus: conditionalGateOpen ? effect.bonusFlatDamage : 0,
        effectivePenetrationBonus: conditionalGateOpen ? effect.bonusPenetration : 0,
        bonusHitsPerDoS: effect.bonusHitsPerDoS,
        ignoresCover: effect.ignoresCover,
        ignoresEnergyFields: effect.ignoresEnergyFields,
        reliabilityShift: effect.reliabilityShift,
        stealthBonus: effect.stealthBonus,
        fireDamage: effect.fireDamage,
    };
}
