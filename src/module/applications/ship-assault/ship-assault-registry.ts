/**
 * Registry of the RT ship assault actions the voidcraft sheet offers.
 */

import { BOARD_FLOW, BOARDING_ROUND_FLOW } from './boarding-flow.ts';
import { HIT_AND_RUN_FLOW } from './hit-and-run-flow.ts';
import { RAMMING_FLOW } from './ramming-flow.ts';
import type { ShipAssaultEntry, ShipAssaultTab } from './ship-assault-flow.ts';

/** Every assault action, in the order the sheet lists them. */
export const SHIP_ASSAULTS: readonly ShipAssaultEntry[] = [RAMMING_FLOW, BOARD_FLOW, BOARDING_ROUND_FLOW, HIT_AND_RUN_FLOW];

/** Look an assault action up by its `data-assault` id. */
export function findShipAssault(id: string): ShipAssaultEntry | undefined {
    return SHIP_ASSAULTS.find((entry) => entry.id === id);
}

/** The sheet's button rows for one tab. */
export interface ShipAssaultButton {
    id: string;
    label: string;
    hint: string;
    icon: string;
}

/** Build the button rows a voidcraft-sheet tab shows, localized. */
export function shipAssaultButtons(tab: ShipAssaultTab, localize: (key: string) => string): ShipAssaultButton[] {
    return SHIP_ASSAULTS.filter((entry) => entry.tab === tab).map((entry) => ({
        id: entry.id,
        label: localize(entry.labelKey),
        hint: localize(entry.hintKey),
        icon: entry.icon,
    }));
}
