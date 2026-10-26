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

/** A ship-action row with the guided resolver for the same action, when there is one. */
export type WithShipAssault<R> = R & { assault: ShipAssaultButton | null };

/**
 * Pair each ship-action row (the rules card a crew dispatches) with the guided
 * assault resolver whose id is the row's order identifier (#701). Hit and Run was
 * listed twice on the Extended Actions tab: once as the resolver, once as the
 * rules card. One action is one row now, carrying both buttons. A resolver with
 * no matching row (ramming, boarding) stays in the assault panel.
 */
export function attachShipAssaults<R extends { identifier: string }>(
    rows: readonly R[],
    assaults: readonly ShipAssaultButton[],
): { rows: Array<WithShipAssault<R>>; unmatched: ShipAssaultButton[] } {
    const byId = new Map(assaults.map((assault) => [assault.id, assault]));
    const used = new Set<string>();
    const paired = rows.map((row) => {
        const assault = row.identifier === '' ? undefined : byId.get(row.identifier);
        if (assault !== undefined) used.add(assault.id);
        return { ...row, assault: assault ?? null };
    });
    return { rows: paired, unmatched: assaults.filter((assault) => !used.has(assault.id)) };
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
