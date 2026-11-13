import type { I18nKey } from '../types/i18n-keys';

/**
 * Armour modifications installed on a suit of armour (#730): which may go on,
 * how many sub-systems a suit holds, and the armour points they add.
 *
 * Three kinds share the `armourModification` item type, told apart by its
 * `category`:
 * - `upgrade` — an armoury upgrade (Ablative, Ceramite …); uses the suit's
 *   `modificationSlots`.
 * - `subsystem` — a power-armour sub-system that still works (Auto-senses,
 *   Vox Link …); a suit holds `subsystemSlots` of them (Black Crusade power
 *   armour: three), plus any a fitted modification adds (Careful Maintenance:
 *   two more).
 * - `customisation` — a suit's rolled quirk; no slot limit.
 *
 * Content values (which mods, how many slots, how much AP) live on the
 * compendium documents; this module only counts and sums them. Pure, so it is
 * unit-tested.
 */

export const ARMOUR_MOD_CATEGORIES = ['upgrade', 'subsystem', 'customisation'] as const;
export type ArmourModCategory = (typeof ARMOUR_MOD_CATEGORIES)[number];

/** Each category's langpack label: a content-agnostic primitive, so its keys sit here. */
export const ARMOUR_MOD_CATEGORY_LABELS: Record<ArmourModCategory, I18nKey> = {
    upgrade: 'WH40K.ItemSheet.ArmourMod.Category.Upgrade',
    subsystem: 'WH40K.ItemSheet.ArmourMod.Category.Subsystem',
    customisation: 'WH40K.ItemSheet.ArmourMod.Category.Customisation',
};

/** The six hit locations an armour point bonus can name. */
export const ARMOUR_MOD_LOCATIONS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type ArmourModLocation = (typeof ARMOUR_MOD_LOCATIONS)[number];

/** A location → AP bonus map; a missing or null location adds nothing. */
export type LocationArmourPoints = Partial<Record<ArmourModLocation, number | null>>;

/** What an installed modification keeps on the armour (`system.modifications[]`). */
export interface InstalledArmourMod {
    uuid: string;
    name: string;
    active: boolean;
    category: string;
    cachedModifiers: {
        armourPoints?: number | null;
        maxAgility?: number | null;
        subsystemSlots?: number | null;
        locations?: LocationArmourPoints | null;
    };
}

/** The slice of an armour item the install check reads. */
export interface ArmourSlots {
    type: string;
    modificationSlots: number;
    subsystemSlots: number;
    modifications: readonly InstalledArmourMod[];
}

/** The slice of an armour-modification item the install check reads. */
export interface ArmourModSource {
    category: string;
    restrictions: { armourTypes: Iterable<string> };
    modifiers: { armourPoints?: number | null; maxAgility?: number | null; subsystemSlots?: number | null; locations?: LocationArmourPoints | null };
}

/** A category the item names, or `upgrade` for an unknown or blank one (every mod before #730). */
export function armourModCategory(raw: string | null | undefined): ArmourModCategory {
    return ARMOUR_MOD_CATEGORIES.find((category) => category === raw) ?? 'upgrade';
}

function count(mods: readonly InstalledArmourMod[], category: ArmourModCategory): number {
    return mods.filter((mod) => armourModCategory(mod.category) === category).length;
}

/** How many sub-systems the suit holds: its own slots plus what its active modifications add. */
export function subsystemCapacity(armour: ArmourSlots): number {
    const added = armour.modifications.filter((mod) => mod.active).reduce((sum, mod) => sum + (mod.cachedModifiers.subsystemSlots ?? 0), 0);
    return Math.max(0, armour.subsystemSlots + added);
}

/** Free upgrade slots (upgrades only; sub-systems and customisations have their own rules). */
export function freeUpgradeSlots(armour: ArmourSlots): number {
    return armour.modificationSlots - count(armour.modifications, 'upgrade');
}

/** Free sub-system slots. */
export function freeSubsystemSlots(armour: ArmourSlots): number {
    return subsystemCapacity(armour) - count(armour.modifications, 'subsystem');
}

/** Why a modification cannot go on, or `ok`. */
export type InstallVerdict = 'ok' | 'duplicate' | 'wrong-armour-type' | 'no-upgrade-slot' | 'no-subsystem-slot';

/**
 * May `mod` (compendium or world item `uuid`) be fitted to `armour`? It must not
 * already be fitted, must allow the suit's armour type (an empty restriction, or
 * one naming `any`, allows every type), and must find a free slot of its own category.
 */
export function installVerdict(armour: ArmourSlots, uuid: string, mod: ArmourModSource): InstallVerdict {
    if (armour.modifications.some((installed) => installed.uuid === uuid)) return 'duplicate';
    const allowed = [...mod.restrictions.armourTypes];
    if (allowed.length > 0 && !allowed.includes('any') && !allowed.includes(armour.type)) return 'wrong-armour-type';
    const category = armourModCategory(mod.category);
    if (category === 'upgrade' && freeUpgradeSlots(armour) <= 0) return 'no-upgrade-slot';
    if (category === 'subsystem' && freeSubsystemSlots(armour) <= 0) return 'no-subsystem-slot';
    return 'ok';
}

/** The entry `system.modifications[]` stores for a fitted modification. */
export function installedEntry(uuid: string, name: string, mod: ArmourModSource): InstalledArmourMod {
    const locations: LocationArmourPoints = {};
    for (const location of ARMOUR_MOD_LOCATIONS) {
        const value = mod.modifiers.locations?.[location];
        if (typeof value === 'number' && value !== 0) locations[location] = value;
    }
    return {
        uuid,
        name,
        active: true,
        category: armourModCategory(mod.category),
        cachedModifiers: {
            armourPoints: mod.modifiers.armourPoints ?? 0,
            maxAgility: mod.modifiers.maxAgility ?? 0,
            subsystemSlots: mod.modifiers.subsystemSlots ?? 0,
            locations,
        },
    };
}

/**
 * The armour points the suit's active modifications add at one location: each
 * one's flat bonus plus its bonus for that location (Enhanced Ceramite Plating:
 * +2 on the Body). The caller adds it only where the suit covers the location.
 */
export function modArmourBonus(mods: readonly InstalledArmourMod[], location: string): number {
    return mods
        .filter((mod) => mod.active)
        .reduce((sum, mod) => {
            const at = ARMOUR_MOD_LOCATIONS.find((loc) => loc === location);
            const local = at === undefined ? 0 : mod.cachedModifiers.locations?.[at] ?? 0;
            return sum + (mod.cachedModifiers.armourPoints ?? 0) + local;
        }, 0);
}
