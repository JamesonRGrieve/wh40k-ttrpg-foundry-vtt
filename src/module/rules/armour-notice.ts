/**
 * The Combat tab's armour notice (#798). A character whose armour sits in the
 * inventory unequipped reads 0 AP at every location with no hint why, so the
 * Armour panel says so: no notice once any armour is worn, a notice naming the
 * unequipped pieces when some are carried, and a lighter one when none are.
 */

/** One armour item, as the rule reads it. */
export interface ArmourPiece {
    readonly id: string;
    readonly name: string;
    readonly equipped: boolean;
}

/** What the Armour panel tells the player. */
export type ArmourNotice = { readonly kind: 'none' } | { readonly kind: 'unequipped'; readonly pieces: ReadonlyArray<Pick<ArmourPiece, 'id' | 'name'>> };

/** The notice for a character's armour items, or null when some armour is equipped. */
export function armourNotice(armour: readonly ArmourPiece[]): ArmourNotice | null {
    if (armour.some((piece) => piece.equipped)) return null;
    if (armour.length === 0) return { kind: 'none' };
    return { kind: 'unequipped', pieces: armour.map(({ id, name }) => ({ id, name })) };
}
