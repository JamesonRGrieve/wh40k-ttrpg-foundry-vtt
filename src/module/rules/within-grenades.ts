/**
 * Within-supplement grenade registry (#135).
 *
 * Within (and core) introduces several thrown grenades whose mechanical
 * payload is a save-or-suffer rider rather than a damage roll: Photon
 * Flash (Agility-or-blinded), Psychotroke (Toughness-or-hallucinate
 * with DoF step-up), Tears-of-the-Emperor (Willpower-or-Perils against
 * psykers), and the cover-staple Smoke grenade.
 *
 * This module is the canonical typed registry — the throw-grenade
 * dialog (`grenade-throw-dialog.ts`) renders an entry into a chat card
 * showing the blast radius, damage, save kind, and fail effect. Future
 * additions (Psyk-out, Rad, Spore Bomb, Whitefire) extend the registry
 * without changing its consumers.
 */

/** Toughness, Agility, or Willpower test on each target inside the blast. */
export type GrenadeSaveCharacteristic = 'toughness' | 'agility' | 'willpower';

export interface GrenadeSave {
    /** Characteristic the on-target save uses. */
    characteristic: GrenadeSaveCharacteristic;
    /**
     * Test difficulty modifier, in DH-style increments
     * (-30 Very Hard, -20 Hard, -10 Challenging, 0 Ordinary, +10 Routine, ...).
     */
    difficulty: number;
}

export interface GrenadeDefinition {
    /** Stable registry key. */
    id: string;
    /** i18n key under `WH40K.WithinGrenade.Names.*`. */
    labelKey: string;
    /** Blast radius in metres (from Blast (X) special quality). */
    blastRadius: number;
    /** Free-form damage expression — empty when the grenade does no damage. */
    damage: string;
    /** Quality strings (Blast (3), Hallucinogenic (4), Smoke (4), ...). */
    specialQualities: readonly string[];
    /**
     * On-target save (toughness/agility/willpower) + free-form failure-effect
     * description that flows into the chat card.
     */
    save: GrenadeSave;
    /** Free-form effect that fires when the save is failed. */
    failEffect: string;
    /** Tailwind accent class used by the chat card for this grenade type. */
    accentClass: string;
}

export const WITHIN_GRENADES: Record<string, GrenadeDefinition> = {
    photonFlash: {
        id: 'photonFlash',
        labelKey: 'WH40K.WithinGrenade.Names.photonFlash',
        blastRadius: 6,
        damage: '',
        specialQualities: ['Blast (6)'],
        save: { characteristic: 'agility', difficulty: 10 },
        failEffect: 'Blinded for a number of rounds equal to the degrees of failure.',
        accentClass: 'tw-text-white',
    },
    psychotroke: {
        id: 'psychotroke',
        labelKey: 'WH40K.WithinGrenade.Names.psychotroke',
        blastRadius: 3,
        damage: '',
        specialQualities: ['Blast (3)', 'Hallucinogenic (4)'],
        save: { characteristic: 'toughness', difficulty: 0 },
        failEffect: 'Hallucinogenic effects roll +1 per degree of failure (max 10). Respirators and sealed armour grant no bonus.',
        accentClass: 'tw-text-purple-400',
    },
    tearsOfTheEmperor: {
        id: 'tearsOfTheEmperor',
        labelKey: 'WH40K.WithinGrenade.Names.tearsOfTheEmperor',
        blastRadius: 2,
        damage: '1d10 X',
        specialQualities: ['Blast (2)', 'Sanctified'],
        save: { characteristic: 'willpower', difficulty: -20 },
        failEffect: 'Psykers roll immediately on Perils of the Warp. Daemonic creatures gain Warp Instability until the end of the encounter.',
        accentClass: 'tw-text-gold',
    },
    smoke: {
        id: 'smoke',
        labelKey: 'WH40K.WithinGrenade.Names.smoke',
        blastRadius: 4,
        damage: '',
        specialQualities: ['Smoke (4)'],
        save: { characteristic: 'agility', difficulty: 0 },
        failEffect: 'Smoke cloud obscures vision; sight-based actions in the cloud require an Agility test or suffer the usual obscured-target penalties.',
        accentClass: 'tw-text-gray-400',
    },
};

/**
 * Resolve a grenade definition by id, or `null` when the id is
 * unknown. Consumers should treat `null` as a no-op and surface the
 * issue via the calling chat / dialog, never throw.
 */
export function getWithinGrenade(id: string): GrenadeDefinition | null {
    return WITHIN_GRENADES[id] ?? null;
}

/** Ordered list — used by the picker so the dialog renders deterministically. */
export function listWithinGrenades(): readonly GrenadeDefinition[] {
    return Object.values(WITHIN_GRENADES);
}
