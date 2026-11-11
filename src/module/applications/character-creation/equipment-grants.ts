/**
 * Origin-path starting equipment.
 *
 * A background prints its starting kit (DH2 Adepta Sororitas: chainblade,
 * armoured bodyglove, chrono, …) as `grants.equipment`, and some backgrounds
 * add a pick between items as a `grants.choices` entry of type `equipment` or
 * `gear` ("Hand Flamer or Laspistol"). The builder showed both but created
 * neither, so a character applied from the builder started with no kit.
 *
 * This module holds the pure half: which items an origin grants, and how a
 * name-only grant entry finds its compendium item. The builder resolves and
 * creates them on commit.
 */

import { type ChoiceLike, iterateResolvedChoices, type SelectedChoices } from '../../utils/origin-choices.ts';

/** Choice types whose options are pieces of starting equipment. */
const EQUIPMENT_CHOICE_TYPES: ReadonlySet<string> = new Set(['equipment', 'gear']);

/** One starting-equipment item an origin grants. */
export interface EquipmentGrantPlan {
    name: string;
    /** Compendium UUID when the grant names one; most authored kits carry the name only. */
    uuid: string | undefined;
    quantity: number;
}

interface EquipmentGrantEntry {
    name?: string | undefined;
    uuid?: string | undefined;
    quantity?: number | undefined;
}

interface EquipmentChoice extends ChoiceLike {
    type?: string | undefined;
}

/** The slice of an origin path's `system` this reads. */
export interface EquipmentGrantSource {
    grants?:
        | {
              equipment?: readonly EquipmentGrantEntry[] | undefined;
              choices?: readonly EquipmentChoice[] | undefined;
          }
        | undefined;
    selectedChoices?: SelectedChoices | undefined;
}

/** A picked option's item name: its `name`, else its `label`, else the stored pick itself. */
function optionName(option: { name?: string | undefined; label?: string | undefined } | undefined, fallback: string): string {
    return (option?.name ?? option?.label ?? fallback).trim();
}

/**
 * Every starting-equipment item one committed origin grants: its fixed kit,
 * then the options the player picked in its equipment choices.
 */
export function collectEquipmentGrantPlans(system: EquipmentGrantSource): EquipmentGrantPlan[] {
    const plans: EquipmentGrantPlan[] = [];
    for (const entry of system.grants?.equipment ?? []) {
        const name = (entry.name ?? '').trim();
        if (name === '') continue;
        const uuid = typeof entry.uuid === 'string' && entry.uuid !== '' ? entry.uuid : undefined;
        const quantity = typeof entry.quantity === 'number' && entry.quantity > 0 ? Math.trunc(entry.quantity) : 1;
        plans.push({ name, uuid, quantity });
    }
    for (const { choice, selectedValues, resolveOption } of iterateResolvedChoices(system.grants?.choices ?? [], system.selectedChoices ?? {})) {
        if (!EQUIPMENT_CHOICE_TYPES.has(choice.type ?? '')) continue;
        for (const value of selectedValues) {
            const name = optionName(resolveOption(value), value);
            if (name !== '') plans.push({ name, uuid: undefined, quantity: 1 });
        }
    }
    return plans;
}

/**
 * Compare key for an equipment name: letters only, lower case, a trailing
 * plural "s" dropped. Kits print "Dataslate", "Micro-bead" and "Sacred
 * Unguent" where the compendium holds "Data-Slate", "Micro-Bead" and "Sacred
 * Unguents".
 */
export function equipmentNameKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .replace(/s$/, '');
}

/**
 * The compendium entry a name-only grant means: an exact name match first;
 * otherwise the single entry whose {@link equipmentNameKey} matches. Two loose
 * matches are ambiguous and resolve to nothing rather than to a guess.
 */
export function matchEquipmentEntry<T extends { name: string }>(entries: readonly T[], name: string): T | undefined {
    const exact = entries.find((entry) => entry.name === name);
    if (exact !== undefined) return exact;
    const key = equipmentNameKey(name);
    if (key === '') return undefined;
    const loose = entries.filter((entry) => equipmentNameKey(entry.name) === key);
    return loose.length === 1 ? loose[0] : undefined;
}

/** An ammunition document's authored `weaponTypes`: a flat list, or a per-line map (`{ dh2: [...] }`). */
export type AmmoWeaponTypes = readonly string[] | Readonly<Partial<Record<string, readonly string[]>>>;

/** A compendium index entry for an ammunition document, as the clip lookup reads it. */
export interface AmmoIndexEntry {
    uuid: string;
    name: string;
    identifier: string;
    standard: boolean;
    weaponTypes: AmmoWeaponTypes | undefined;
}

/** An ammunition entry's weapon types for `line`, from either authored shape. */
export function ammoWeaponTypesFor(weaponTypes: AmmoWeaponTypes | undefined, line: string): readonly string[] {
    if (weaponTypes === undefined) return [];
    if (isWeaponTypeList(weaponTypes)) return weaponTypes;
    return weaponTypes[line] ?? [];
}

/** Narrow the flat-list form of {@link AmmoWeaponTypes}. */
function isWeaponTypeList(weaponTypes: AmmoWeaponTypes): weaponTypes is readonly string[] {
    return Array.isArray(weaponTypes);
}

/**
 * The standard ammunition (`system.standard`) a weapon of `weaponType` loads: one
 * whose identifier starts with the weapon's own (Laspistol → Laspistol Charge Pack)
 * when the line has one, else the first standard entry for that type.
 */
export function pickStandardAmmo(entries: readonly AmmoIndexEntry[], weaponType: string, weaponIdentifier: string, line: string): AmmoIndexEntry | undefined {
    if (weaponType === '') return undefined;
    const fits = entries.filter((entry) => entry.standard && ammoWeaponTypesFor(entry.weaponTypes, line).includes(weaponType));
    const own = weaponIdentifier === '' ? undefined : fits.find((entry) => entry.identifier.startsWith(`${weaponIdentifier}-`));
    return own ?? fits[0];
}

/** Clips of standard ammunition each starting ranged weapon comes with when standard ammo is tracked. */
export const STARTING_CLIPS = 2;
