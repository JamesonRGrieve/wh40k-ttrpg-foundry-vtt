/**
 * Printed weapon classes the weapon schema accepts, shared by `defineSchema()`
 * and the `_migrateData` coercion so a corrupt/legacy value is normalised to a
 * valid choice instead of failing strict validation (which, for an owned item,
 * drops it from the actor). `vehicle` is OW's class for vehicle-mounted guns;
 * `placed` is DW's "Placed Explosive" (Melta Bomb).
 */
export const WEAPON_CLASS_CHOICES = ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic', 'vehicle', 'placed'] as const;

export type WeaponClass = (typeof WEAPON_CLASS_CHOICES)[number];

/** Whether `value` is a printed weapon class this schema accepts (anything else migrates to `exotic`). */
export function isWeaponClass(value: string): value is WeaponClass {
    return (WEAPON_CLASS_CHOICES as readonly string[]).includes(value);
}

/** Firearm classes: they shoot, reload and carry a clip. */
const FIREARM_CLASSES: readonly string[] = ['pistol', 'basic', 'heavy'];

/**
 * Classes that make a ranged attack with a printed range and rate of fire: the
 * firearms, and thrown weapons (#699: the DH2 Bolas, Thrown 10m, showed no range,
 * because the sheet showed range only for the three firearm classes).
 */
const RANGED_ATTACK_CLASSES: readonly string[] = [...FIREARM_CLASSES, 'thrown'];

/** Whether a weapon class is a firearm (pistol, basic, heavy). */
export function isFirearmClass(weaponClass: string): boolean {
    return FIREARM_CLASSES.includes(weaponClass);
}

/**
 * Whether a weapon class is thrown. A thrown weapon is the round itself: it has no
 * magazine to show and nothing to reload (#701: the DH2 Bolas, Clip 1 Reload –,
 * showed Clip and Reload tiles).
 */
export function isThrownClass(weaponClass: string): boolean {
    return weaponClass === 'thrown';
}

/** Whether a weapon class has a range and a rate of fire: a firearm, or a thrown weapon. */
export function classHasRange(weaponClass: string): boolean {
    return RANGED_ATTACK_CLASSES.includes(weaponClass);
}
