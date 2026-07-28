/**
 * @file Weapon-mounting vocabulary shared by the vehicle actor models and the
 * weapon item model.
 *
 * A mounted weapon's arc is a property of the *installation*, not of the weapon
 * type — the same Heavy Bolter is hull-mounted on one tank and sponson-mounted
 * on the next — so the fields live on the weapon item and the embedded copy on
 * a craft is what sets them. The vocabulary sits here rather than in either
 * model so neither the item layer nor the actor layer has to import the other.
 *
 * These are content-agnostic rules primitives (Direction #7): the enum members
 * are mechanics defined in the rulebooks' vehicle chapters, not content values.
 */

/**
 * RAW weapon mountings, shared by every FFG-era line. Only War core p.211–212
 * defines the canonical six; DH2, DW, RT, BC, and DH1 print the same set on
 * their vehicle weapon lines. Each mounting fixes the weapon's fire arc and
 * carries its own rules:
 *
 * - `fixed` — no traverse; fires straight ahead from its facing.
 * - `hull` — 45° arc from its facing.
 * - `turret` — 360° arc; hits always resolve against Front armour.
 * - `sponson` — 180° arc from its facing. Walkers treat all weapons as sponson.
 * - `coaxial` — shares the arc of the weapon it is linked to, and may fire with
 *   it as one Full Action, granting +20 BS to the linked gun on a hit.
 * - `pintle` — usually 360°; has no assigned crew and may be fired by anyone
 *   who can reach it, passengers included.
 */
export const WEAPON_MOUNTING_CHOICES = ['', 'fixed', 'hull', 'turret', 'sponson', 'coaxial', 'pintle'] as const;

/** A mounting's fire arc is measured from one of the craft's facings (OW core p.211). */
export const WEAPON_FACING_CHOICES = ['', 'front', 'rear', 'left', 'right', 'all'] as const;

/** A single RAW weapon mounting. Empty string = personal-scale (unmounted). */
export type WeaponMounting = (typeof WEAPON_MOUNTING_CHOICES)[number];

/** The facing a mounted weapon's arc is measured from. Empty string = unmounted. */
export type WeaponFacing = (typeof WEAPON_FACING_CHOICES)[number];
