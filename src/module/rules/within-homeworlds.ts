/**
 * Within-supplement homeworld trait registry (#139).
 *
 * Source: `within.md` L632-808 — three new homeworlds introduced by
 * the Within supplement for Dark Heresy 2e. Each entry encodes the
 * data a character-creation flow needs to apply the homeworld:
 *
 *   - characteristic modifiers (the +/- pairs);
 *   - fate threshold + Emperor's Blessing breakpoint;
 *   - the prose-named home-world bonus (rules text);
 *   - key (favoured) aptitude(s);
 *   - starting wounds (flat plus 1d5 die kept symbolic).
 *
 * The registry is pure data — no Foundry imports, no DataModel
 * coupling. Application of the homeworld to a fresh actor lives in
 * sibling flows that read this constant.
 */

import { lookupById } from './homeworlds-common.ts';

/** The five core Characteristics used by every homeworld mod table. */
export type WithinCharacteristic =
    | 'weaponSkill'
    | 'ballisticSkill'
    | 'strength'
    | 'toughness'
    | 'agility'
    | 'intelligence'
    | 'perception'
    | 'willpower'
    | 'fellowship';

/** A homeworld's characteristic adjustment — both positives and the single penalty. */
interface WithinCharacteristicMods {
    readonly positive: readonly WithinCharacteristic[];
    readonly negative: readonly WithinCharacteristic[];
}

/** Fate threshold + the d10 face required to trigger Emperor's Blessing (an extra Fate point). */
interface WithinFateThreshold {
    readonly base: number;
    readonly emperorsBlessingMin: number;
}

/** Starting-wounds expression: `flat + Nd5` matches every Within homeworld's wording. */
interface WithinWoundsRoll {
    readonly flat: number;
    readonly dice: number;
    readonly faces: 5;
}

/** One canonical homeworld definition. */
export interface WithinHomeworldDef {
    /** Registry key (stable id used by other modules). */
    readonly id: WithinHomeworldId;
    /** Display label (English; localized at render time via `WH40K.WithinHomeworld.*`). */
    readonly label: string;
    readonly characteristicMods: WithinCharacteristicMods;
    readonly fateThreshold: WithinFateThreshold;
    /** Named home-world bonus + the rules-text body. */
    readonly homeWorldBonus: {
        readonly name: string;
        readonly description: string;
    };
    /** Favoured aptitude(s) — every Within entry lists exactly one Characteristic aptitude. */
    readonly keyAptitudes: readonly WithinCharacteristic[];
    readonly wounds: WithinWoundsRoll;
    /** Background suggestions from the supplement (informational; not a hard restriction). */
    readonly recommendedBackgrounds: readonly string[];
}

export type WithinHomeworldId = 'agriWorld' | 'feudalWorld' | 'frontierWorld';

export const WITHIN_HOMEWORLDS: Record<WithinHomeworldId, WithinHomeworldDef> = {
    agriWorld: {
        id: 'agriWorld',
        label: 'Agri World',
        characteristicMods: {
            positive: ['fellowship', 'strength'],
            negative: ['agility'],
        },
        fateThreshold: { base: 2, emperorsBlessingMin: 7 },
        homeWorldBonus: {
            name: 'Strength from the Land',
            description: 'An agri-world character starts with the Brutal Charge (2) trait.',
        },
        keyAptitudes: ['strength'],
        wounds: { flat: 8, dice: 1, faces: 5 },
        recommendedBackgrounds: ['Adeptus Mechanicus', 'Adeptus Ministorum', 'Imperial Guard', 'Mutant'],
    },
    feudalWorld: {
        id: 'feudalWorld',
        label: 'Feudal World',
        characteristicMods: {
            positive: ['perception', 'weaponSkill'],
            negative: ['intelligence'],
        },
        fateThreshold: { base: 3, emperorsBlessingMin: 6 },
        homeWorldBonus: {
            name: 'At Home in Armour',
            description: 'A feudal world character ignores the maximum Agility value imposed by any armour he is wearing.',
        },
        keyAptitudes: ['weaponSkill'],
        wounds: { flat: 9, dice: 1, faces: 5 },
        recommendedBackgrounds: ['Adepta Sororitas', 'Adeptus Administratum', 'Adeptus Ministorum', 'Imperial Guard'],
    },
    frontierWorld: {
        id: 'frontierWorld',
        label: 'Frontier World',
        characteristicMods: {
            positive: ['ballisticSkill', 'perception'],
            negative: ['fellowship'],
        },
        fateThreshold: { base: 3, emperorsBlessingMin: 7 },
        homeWorldBonus: {
            name: 'Rely on None but Yourself',
            description:
                'A frontier world character gains a +20 bonus to Tech-Use tests when applying personal weapon modifications, and a +10 bonus when repairing damaged items.',
        },
        keyAptitudes: ['ballisticSkill'],
        wounds: { flat: 7, dice: 1, faces: 5 },
        recommendedBackgrounds: ['Adeptus Arbites', 'Adeptus Astra Telepathica', 'Mutant', 'Outcast'],
    },
};

/** Stable iteration order matching the supplement's chapter order. */
export const WITHIN_HOMEWORLD_IDS: readonly WithinHomeworldId[] = ['agriWorld', 'feudalWorld', 'frontierWorld'];

/** Convenience: typed lookup. Returns `undefined` for unknown ids. */
export function getWithinHomeworld(id: string): WithinHomeworldDef | undefined {
    return lookupById(WITHIN_HOMEWORLDS, id);
}
