/**
 * Starship action rows for the voidcraft sheet's Extended and Manoeuvre Action
 * tabs (#185, #186).
 *
 * Both lists are `order` items. They are told apart by the item's own
 * `system.actionType`, which the compendium content authors explicitly
 * (`maneuver-action` / `extended-action`), never by a pack name or a display
 * name. Everything here is a pure projection of a schema-cleaned `order`
 * system payload, so it is unit-testable against the real pack shape.
 */

import { hasShipEffect, type ShipEffectData } from './ship-action-effects.ts';

/** Every `order` action type the `OrderData` schema accepts. */
export const ORDER_ACTION_TYPES = ['extended-action', 'reaction', 'shooting-action', 'maneuver-action'] as const;
export type OrderActionType = (typeof ORDER_ACTION_TYPES)[number];

/** The two voidcraft-sheet tabs that list starship actions. */
export type ShipActionKind = 'extended' | 'manoeuvre';

/** The `order` action type each tab lists. */
const SHIP_ACTION_ORDER_TYPE: Readonly<Record<ShipActionKind, OrderActionType>> = {
    extended: 'extended-action',
    manoeuvre: 'maneuver-action',
};

/** The schema-cleaned `order` system fields a ship-action row reads. */
export interface ShipActionOrderSystem {
    actionType: string;
    /** `shipStat` names the ship stat a Combined Skill Test adds (RT Core p.212); empty otherwise. */
    test: { skill: string; characteristic: string; modifier: number; shipStat: string };
    duration: string;
    requirements: string;
    typeAndAction: string;
    description: { value: string };
    /** The authored automated effect (#186); `kind: ''` for a rules-card-only action. */
    shipEffect: ShipEffectData;
}

/** The document-level identity a row carries alongside its system fields. */
export interface ShipActionOrderView {
    uuid: string;
    id: string;
    name: string;
    img: string;
    system: ShipActionOrderSystem;
}

/** One row of the Extended / Manoeuvre Actions tab, and the chat card's payload. */
export interface ShipActionRow {
    uuid: string;
    id: string;
    name: string;
    img: string;
    skill: string;
    modifier: number;
    duration: string;
    description: string;
    requirements: string;
    typeAndAction: string;
    /** True when the action rolls its test and applies an authored effect from the sheet. */
    rollable: boolean;
}

/**
 * The test an action calls for: the skill, or the characteristic when the
 * action tests one directly (Hold Fast! tests Willpower).
 */
export function shipActionTestLabel(test: ShipActionOrderSystem['test']): string {
    return test.skill !== '' ? test.skill : test.characteristic;
}

/** Project an order into a row. Pure; no kind filtering. */
export function toShipActionRow(order: ShipActionOrderView): ShipActionRow {
    const { system } = order;
    return {
        uuid: order.uuid,
        id: order.id,
        name: order.name,
        img: order.img,
        skill: shipActionTestLabel(system.test),
        modifier: system.test.modifier,
        duration: system.duration,
        description: system.description.value,
        requirements: system.requirements,
        typeAndAction: system.typeAndAction,
        rollable: hasShipEffect(system.shipEffect),
    };
}

/**
 * The rows a tab lists: the orders whose `actionType` matches the tab, one per
 * uuid (an owned copy and its compendium source are separate uuids, so both
 * may appear), sorted by name.
 */
export function shipActionRows(orders: Iterable<ShipActionOrderView>, kind: ShipActionKind): ShipActionRow[] {
    const wanted = SHIP_ACTION_ORDER_TYPE[kind];
    const seen = new Set<string>();
    const rows: ShipActionRow[] = [];
    for (const order of orders) {
        if (order.system.actionType !== wanted || order.uuid === '' || seen.has(order.uuid)) continue;
        seen.add(order.uuid);
        rows.push(toShipActionRow(order));
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fold the legacy flat test fields some `order` content carries (`skill`,
 * `modifier` at the top of `system`) into the schema's `test` block, in place.
 * A payload that already has a `test` block keeps it; the flat fields are
 * dropped either way since the schema never held them. Without this the
 * schema strips them on load and every RT ship action reads "Command +0".
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: raw Foundry V14 `_migrateData` source payload, untyped before the schema cleans it
export function migrateLegacyOrderTest(source: Record<string, unknown>): void {
    const { skill, modifier } = source;
    if (skill === undefined && modifier === undefined) return;
    const existing = source['test'];
    if (existing === undefined || existing === null) {
        // Only the authored halves; the schema fills the rest with its initials.
        source['test'] = {
            ...(typeof skill === 'string' ? { skill } : {}),
            ...(typeof modifier === 'number' ? { modifier } : {}),
        };
    }
    delete source['skill'];
    delete source['modifier'];
}

/** A Weapon Component as a ship action offers it for choosing (Lock on Target, #186). */
export interface ShipWeaponChoice {
    readonly id: string;
    readonly name: string;
}

/**
 * The ship's Weapon Components in the order a choice lists them: the sheet's
 * own order (each item's `sort`), then by name. An embedded collection does
 * not promise an iteration order, so the list must not depend on it.
 */
export function shipWeaponChoices(weapons: Iterable<ShipWeaponChoice & { readonly sort: number }>): ShipWeaponChoice[] {
    return [...weapons].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }));
}
