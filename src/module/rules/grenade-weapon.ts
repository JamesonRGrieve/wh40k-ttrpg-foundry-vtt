/**
 * @file The grenade classifier (#619): whether a weapon is a grenade, read from the
 * weapon's own structured data.
 *
 * The packs mark a grenade by its weapon class and type: a `thrown` weapon whose type
 * is the line's grenade type (`grenade` in DH1 / DH2, `explosive` in RT / DW). A
 * weapon carrying the Grenade quality is one too. `special` is a Set of quality ids,
 * so membership is `.has` — the old `.includes` checks never matched a Set.
 */

/** Weapon types that make a thrown weapon a grenade: DH1 / DH2 author `grenade`, RT / DW `explosive`. */
const GRENADE_WEAPON_TYPES: ReadonlySet<string> = new Set(['grenade', 'explosive']);

/** The Grenade weapon quality's id. */
const GRENADE_QUALITY = 'grenade';

/** The weapon fields the classifier reads (WeaponData's). */
export interface GrenadeWeaponSystem {
    class?: string;
    type?: string;
    /** The weapon's quality ids (WeaponData's SetField). */
    special?: ReadonlySet<string>;
}

/** Whether the weapon is a grenade: a thrown grenade-type weapon, or one with the Grenade quality. */
export function isGrenadeWeapon(system: GrenadeWeaponSystem): boolean {
    if (system.special?.has(GRENADE_QUALITY) === true) return true;
    return system.class === 'thrown' && system.type !== undefined && GRENADE_WEAPON_TYPES.has(system.type);
}
