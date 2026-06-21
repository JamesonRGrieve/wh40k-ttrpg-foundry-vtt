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
 * Availability choices for a ship-sheet dropdown, derived from the canonical
 * `WH40K.availabilities` map.
 */
export function shipAvailabilityChoices(): Record<string, string> {
    return choicesRecordFrom(WH40K.availabilities);
}
