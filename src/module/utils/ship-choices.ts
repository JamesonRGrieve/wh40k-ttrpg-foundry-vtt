/**
 * @file ship-choices - shared starship dropdown choice builders.
 *
 * The hull-type and availability dropdowns are identical across every ship item
 * sheet (component / upgrade / weapon). They derive from the canonical CONFIG
 * maps (`WH40K.hullTypes`, `WH40K.availabilities`) so a new hull type or an
 * availability rebalance flows through automatically — see issue #336.
 */

import { WH40K } from '../config.ts';
import { choicesRecordFrom } from './config-choices.ts';

/** The "any hull" sentinel offered ahead of the concrete hull types. It is a
 * sheet-level filter option, not a CONFIG hull type, so it is prepended here. */
const ANY_HULL_LABEL_KEY = 'WH40K.HullType.All';

/**
 * Hull-type choices for a ship-sheet multi-select: the canonical
 * `WH40K.hullTypes` map prefixed by the "All" sentinel.
 */
export function shipHullTypeChoices(): Record<string, string> {
    return {
        all: game.i18n.localize(ANY_HULL_LABEL_KEY),
        ...choicesRecordFrom(WH40K.hullTypes),
    };
}

/**
 * The langpack key of a hull type's label, or null when the value is not one of
 * the `WH40K.hullTypes` ids (#647).
 */
export function hullTypeLabelKey(hullType: string): string | null {
    return Object.entries(WH40K.hullTypes).find(([id]) => id === hullType)?.[1].label ?? null;
}

/**
 * The langpack key of a ship component type's label, or null when the value is
 * not one of the `WH40K.shipComponentTypes` ids. The component table showed the
 * raw key (`WH40K.ShipComponent.Auger`): the label was built from the id
 * without the `Type.` segment the langpack nests it under.
 */
export function shipComponentTypeLabelKey(componentType: string): string | null {
    return Object.entries(WH40K.shipComponentTypes).find(([id]) => id === componentType)?.[1].label ?? null;
}

/**
 * One option of the voidcraft hull-type select (#647). `labelKey` is the option's
 * langpack label; null for a stored value that is not a hull type id, which the
 * template shows as-is.
 */
export interface HullTypeOption {
    value: string;
    labelKey: string | null;
    selected: boolean;
}

/** Label of the select's "no hull type yet" option. */
const UNSET_HULL_LABEL_KEY = 'WH40K.Voidcraft.HullTypeUnset';

/**
 * The voidcraft hull-type select's options: every `WH40K.hullTypes` id, after a
 * "not set" option. A select whose stored value is not among its options shows the
 * first option and, the sheet submitting on change, would save it, so a stored
 * value that is not a hull type id keeps an option of its own and is never
 * rewritten unasked.
 */
export function voidcraftHullTypeOptions(current: string): HullTypeOption[] {
    const options: HullTypeOption[] = [
        { value: '', labelKey: UNSET_HULL_LABEL_KEY, selected: current === '' },
        ...Object.entries(WH40K.hullTypes).map(([value, { label }]) => ({ value, labelKey: label, selected: value === current })),
    ];
    if (current !== '' && hullTypeLabelKey(current) === null) options.push({ value: current, labelKey: null, selected: true });
    return options;
}

/**
 * Availability choices for a ship-sheet dropdown, derived from the canonical
 * `WH40K.availabilities` map.
 */
export function shipAvailabilityChoices(): Record<string, string> {
    return choicesRecordFrom(WH40K.availabilities);
}
