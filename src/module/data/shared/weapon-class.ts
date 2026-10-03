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
