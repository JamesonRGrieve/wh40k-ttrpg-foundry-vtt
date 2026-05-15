/**
 * Healing rates (core.md §"Healing", p. 244).
 *
 * Two tiers govern recovery:
 *  - **Lightly Damaged:** current wounds ≥ half max. Heals 1 wound per
 *    day of rest, +TB per successful Difficult (−10) Medicae test.
 *  - **Heavily Damaged:** current wounds < half max. Heals 1 wound per
 *    week of rest, +TB per Hard (−20) Medicae test (max one test per
 *    day).
 *
 * The Medicae action options (First Aid, Extended Care, Surgery) live
 * here as a small registry; the consumer (Acolyte.rollMedicaeAction)
 * picks the right difficulty modifier and duration.
 */

export type DamageTier = 'unharmed' | 'lightlyDamaged' | 'heavilyDamaged';

export function getDamageTier(woundsValue: number, woundsMax: number): DamageTier {
    if (woundsMax <= 0) return 'unharmed';
    if (woundsValue >= woundsMax) return 'unharmed';
    if (woundsValue >= Math.ceil(woundsMax / 2)) return 'lightlyDamaged';
    return 'heavilyDamaged';
}

/** Days of natural rest required to recover 1 wound at the given tier. */
export function getNaturalHealingDays(tier: DamageTier): number {
    switch (tier) {
        case 'unharmed':
            return 0;
        case 'lightlyDamaged':
            return 1;
        case 'heavilyDamaged':
            return 7;
    }
}

export type MedicaeActionKind = 'firstAid' | 'extendedCare' | 'surgery' | 'diagnose' | 'extractBullet';

export interface MedicaeAction {
    kind: MedicaeActionKind;
    label: string;
    difficulty: number; // d100 test modifier
    description: string;
    durationLabel: string;
}

export const MEDICAE_ACTIONS: Record<MedicaeActionKind, MedicaeAction> = {
    firstAid: {
        kind: 'firstAid',
        label: 'First Aid',
        difficulty: 0, // Ordinary
        description: 'Stabilise a fallen ally. Closes Blood Loss; restores 1 wound on success.',
        durationLabel: '1 round',
    },
    extendedCare: {
        kind: 'extendedCare',
        label: 'Extended Care',
        difficulty: -10, // Difficult
        description: 'A full day of focused care. Restores Toughness bonus in wounds; doubles natural healing for the day.',
        durationLabel: '1 day',
    },
    surgery: {
        kind: 'surgery',
        label: 'Surgery',
        difficulty: -20, // Hard
        description: 'Operate on a critically damaged patient. Removes one Critical Injury severity tier on success.',
        durationLabel: 'GM hours',
    },
    diagnose: {
        kind: 'diagnose',
        label: 'Diagnose',
        difficulty: 0,
        description: 'Identify a disease, poison, or unknown affliction. Used to determine an appropriate counter.',
        durationLabel: '1 minute',
    },
    extractBullet: {
        kind: 'extractBullet',
        label: 'Extract Embedded Object',
        difficulty: -10,
        description: 'Remove an embedded bullet, shard, or barb. Failure deals 1d5 Impact damage at the location.',
        durationLabel: '1 minute',
    },
};
