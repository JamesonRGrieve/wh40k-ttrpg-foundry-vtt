/**
 * @file Whether a weapon's damage adds its wielder's Strength Bonus (#744).
 *
 * Every line's rules agree: a melee weapon adds the wielder's SB to its damage, and so
 * does a thrown weapon, except an explosive such as a grenade. This is the single
 * rule the attack's damage, the actor sheet's damage roll, the weapon sheet's Damage
 * tile and the weapon's `+SB` label all read, so they can no longer disagree.
 */

import { isThrownClass } from '../data/shared/weapon-class.ts';
import { type GrenadeWeaponSystem, isGrenadeWeapon } from './grenade-weapon.ts';

/** The weapon fields the rule reads (WeaponData's). */
export interface StrengthBonusWeaponSystem extends GrenadeWeaponSystem {
    /** Melee for the active firing mode (WeaponData's `isMeleeWeapon`). */
    isMeleeWeapon: boolean;
    /** The weapon class for the active firing mode (WeaponData's `effectiveClass`). */
    effectiveClass: string;
}

/** Whether the weapon's damage adds the wielder's Strength Bonus: melee, or thrown but not a grenade. */
export function weaponAddsStrengthBonus(system: StrengthBonusWeaponSystem): boolean {
    if (system.isMeleeWeapon) return true;
    return isThrownClass(system.effectiveClass) && !isGrenadeWeapon(system);
}

/** A characteristic as the damage rule reads it: its bonus, and the bonus after fatigue, drugs and traits (#415). */
export interface StrengthBonusCharacteristic {
    bonus: number;
    effectiveBonus?: number | undefined;
}

/** The Strength Bonus a wielder adds to damage: the effective bonus when one is prepared, else the plain bonus; 0 with no Strength. */
export function wielderStrengthBonus(strength: StrengthBonusCharacteristic | undefined): number {
    if (strength === undefined) return 0;
    return strength.effectiveBonus ?? strength.bonus;
}
