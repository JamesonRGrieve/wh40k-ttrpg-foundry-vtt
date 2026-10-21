import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from '../src/module/constants.ts';
import {
    ITEM_RESOURCE_DELTAS_FLAG,
    type ItemResourceHolder,
    itemResourceHolders,
    ORIGIN_RESOURCE_PATHS,
    type OriginResource,
    readItemResourceDeltas,
    reconcileItemResourceDeltas,
    resetItemResourceDeltas,
    type ResourceBearingItem,
} from '../src/module/origin-grant-ledger.ts';
import { burnFateUpdate, fateBreakdownRows } from '../src/module/rules/fate.ts';
import { contributesItemModifiers } from '../src/module/rules/item-modifier-eligibility.ts';

/**
 * #691: a talent, trait or equipped item's `modifiers.resources` reaches the
 * stored totals through the same reconcile ledger origins use — applied once,
 * recorded per item, reversed when the item goes or stops applying, and never
 * stacked. A character with no ledger yet has its items seeded as already
 * counted, never applied. The actor here is a plain `{ system, flags }` snapshot, and each
 * returned update bag is written into it the way `actor.update` would.
 */

interface ActorState {
    system: { fate: { max: number; value: number }; wounds: { max: number; value: number }; corruption: number; insanity: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: the flags bag mirrors Foundry's open per-scope document flags
    flags: Partial<Record<string, Record<string, unknown>>>;
}

const STARTING_FATE = 2;

/** A character whose (empty) ledger already exists, so every item it gains is applied. */
function character(): ActorState {
    return { ...legacyCharacter(), flags: { [SYSTEM_ID]: { [ITEM_RESOURCE_DELTAS_FLAG]: {} } } };
}

/** A character from before the ledger: its totals already count what it owns. */
function legacyCharacter(fate = STARTING_FATE): ActorState {
    return { system: { fate: { max: fate, value: fate }, wounds: { max: 12, value: 12 }, corruption: 0, insanity: 0 }, flags: {} };
}

/** Write a dot-path update bag into the snapshot, as `actor.update` merges it. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended paths + values)
function applyUpdate(actor: ActorState, updates: Record<string, unknown>): void {
    for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.');
        const last = parts.pop();
        if (last === undefined) continue;
        // eslint-disable-next-line no-restricted-syntax -- boundary: walking the snapshot by string path, as Foundry's update merge does
        let node = actor as unknown as Record<string, unknown>;
        for (const part of parts) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: see above
            const next = (node[part] ?? {}) as Record<string, unknown>;
            node[part] = next;
            node = next;
        }
        node[last] = value;
    }
}

/** One reconcile pass, written back; also unsets the stale keys, as the actor method does. */
function sync(actor: ActorState, items: readonly ItemResourceHolder[], fresh: readonly string[] = []): void {
    const { updates, staleKeys } = reconcileItemResourceDeltas(actor.system, actor.flags, items, ORIGIN_RESOURCE_PATHS, new Set(fresh));
    applyUpdate(actor, updates);
    // eslint-disable-next-line no-restricted-syntax -- boundary: the ledger bag inside the open flags scope
    const bag = actor.flags[SYSTEM_ID]?.[ITEM_RESOURCE_DELTAS_FLAG] as Record<string, unknown> | undefined;
    for (const key of staleKeys) if (bag !== undefined) delete bag[key];
}

const FATED: ItemResourceHolder = { id: 'fated0000000001', contributes: true, resources: { wounds: 0, fate: 1, insanity: 0, corruption: 0 } };

describe('item resource ledger: Fate (#691)', () => {
    it('adding Fated for Greatness raises the Fate total by 1, and removing it lowers it again', () => {
        const actor = character();
        sync(actor, [FATED]);
        expect(actor.system.fate).toEqual({ max: 3, value: 3 });
        expect(readItemResourceDeltas(actor.flags)[FATED.id]).toEqual({ wounds: 0, fate: 1, corruption: 0, insanity: 0 });

        sync(actor, []);
        expect(actor.system.fate).toEqual({ max: 2, value: 2 });
        expect(readItemResourceDeltas(actor.flags)).toEqual({});
    });

    it('re-applying never stacks', () => {
        const actor = character();
        sync(actor, [FATED]);
        sync(actor, [FATED]);
        sync(actor, [FATED]);
        expect(actor.system.fate.max).toBe(3);
        const { updates } = reconcileItemResourceDeltas(actor.system, actor.flags, [FATED], ORIGIN_RESOURCE_PATHS);
        expect(updates).toEqual({});
    });

    it('a changed value moves the total by the difference', () => {
        const actor = character();
        sync(actor, [FATED]);
        sync(actor, [{ ...FATED, resources: { fate: 2 } }]);
        expect(actor.system.fate.max).toBe(4);
    });

    it('Burn Fate still works with the talent owned, and the next reconcile leaves the burn alone', () => {
        const actor = character();
        sync(actor, [FATED]);
        const burn = burnFateUpdate(actor.system.fate);
        expect(burn).toEqual({ 'system.fate.max': 2, 'system.fate.value': 2 });
        applyUpdate(actor, burn ?? {});
        sync(actor, [FATED]);
        expect(actor.system.fate).toEqual({ max: 2, value: 2 });
        // Removing the talent after the burn takes only its own point back off.
        sync(actor, []);
        expect(actor.system.fate).toEqual({ max: 1, value: 1 });
    });

    it('removing the talent after its point was spent never leaves negative Fate', () => {
        const actor = character();
        sync(actor, [FATED]);
        actor.system.fate.value = 0;
        sync(actor, []);
        expect(actor.system.fate).toEqual({ max: 2, value: 0 });
    });

    it("the breakdown's Base is the starting Fate once the talent is applied", () => {
        const actor = character();
        // Fortune (+1) is the origin; its point is already in the total, as the origin ledger leaves it.
        actor.system.fate = { max: STARTING_FATE + 1, value: STARTING_FATE + 1 };
        sync(actor, [FATED]);
        const { base, rows } = fateBreakdownRows(
            actor.system.fate.max,
            [{ name: 'Fortune', value: 1 }],
            [{ name: 'Fated for Greatness', value: 1 }],
            (_uuid, fallback) => fallback,
        );
        expect(actor.system.fate.max).toBe(4);
        expect(base).toBe(STARTING_FATE);
        expect(rows.map((row) => row.value)).toEqual([1, 1]);
    });
});

describe('item resource ledger: other resources (#691)', () => {
    it('applies Wounds to the maximum only, and Insanity and Corruption to their totals', () => {
        const actor = character();
        sync(actor, [
            { id: 'sound00000000001', contributes: true, resources: { wounds: 1 } },
            { id: 'chemgeld00000001', contributes: true, resources: { insanity: 1 } },
            { id: 'tainted000000001', contributes: true, resources: { corruption: 3 } },
        ]);
        expect(actor.system.wounds).toEqual({ max: 13, value: 12 });
        expect(actor.system.insanity).toBe(1);
        expect(actor.system.corruption).toBe(3);
    });

    it('an item that stops applying (unequipped) gives its resources back, and adds them again when re-equipped', () => {
        const actor = character();
        const armour: ItemResourceHolder = { id: 'armour0000000001', contributes: true, resources: { wounds: 2 } };
        sync(actor, [armour]);
        expect(actor.system.wounds.max).toBe(14);
        sync(actor, [{ ...armour, contributes: false }]);
        expect(actor.system.wounds.max).toBe(12);
        sync(actor, [armour]);
        expect(actor.system.wounds.max).toBe(14);
    });

    it('skips a resource the actor does not carry (an NPC has no Corruption)', () => {
        const system = { fate: { max: 1, value: 1 } };
        const { updates } = reconcileItemResourceDeltas(
            system,
            character().flags,
            [{ id: 'x000000000000001', contributes: true, resources: { corruption: 5, fate: 1 } }],
            ORIGIN_RESOURCE_PATHS,
        );
        expect(updates['system.corruption']).toBeUndefined();
        expect(updates['system.fate.max']).toBe(2);
    });
});

describe('item resource ledger: a character with no ledger yet is seeded, never applied (#691)', () => {
    const FATED_TOTAL = 3; // Its Fate already counts Fated for Greatness.
    const SECOND: ItemResourceHolder = { id: 'lostdynasty00001', contributes: true, resources: { fate: 1 } };

    it('an existing character with Fated for Greatness keeps its Fate on first load', () => {
        const actor = legacyCharacter(FATED_TOTAL);
        sync(actor, [FATED, { id: 'none000000000001', contributes: true, resources: undefined }]);
        expect(actor.system.fate).toEqual({ max: FATED_TOTAL, value: FATED_TOTAL });
        expect(readItemResourceDeltas(actor.flags)).toEqual({ [FATED.id]: { wounds: 0, fate: 1, corruption: 0, insanity: 0 } });
        // Later loads change nothing either.
        sync(actor, [FATED]);
        expect(actor.system.fate.max).toBe(FATED_TOTAL);
    });

    it('a second Fate item added afterwards raises the total by 1, and removing the talent afterwards lowers it by 1', () => {
        const actor = legacyCharacter(FATED_TOTAL);
        sync(actor, [FATED]);
        sync(actor, [FATED, SECOND], [SECOND.id]);
        expect(actor.system.fate.max).toBe(FATED_TOTAL + 1);
        sync(actor, [SECOND]);
        expect(actor.system.fate.max).toBe(FATED_TOTAL);
    });

    it('an item added to a character with no ledger is applied, and the items it already owned are seeded', () => {
        const actor = legacyCharacter(FATED_TOTAL);
        sync(actor, [FATED, SECOND], [SECOND.id]);
        expect(actor.system.fate.max).toBe(FATED_TOTAL + 1);
        expect(Object.keys(readItemResourceDeltas(actor.flags)).sort()).toEqual([FATED.id, SECOND.id].sort());
    });

    it('a character with nothing to seed still gets a ledger, so its next item is applied', () => {
        const actor = legacyCharacter();
        sync(actor, []);
        expect(actor.flags[SYSTEM_ID]?.[ITEM_RESOURCE_DELTAS_FLAG]).toEqual({});
        sync(actor, [FATED]);
        expect(actor.system.fate.max).toBe(STARTING_FATE + 1);
    });
});

describe('item resource ledger: the builder reset (#691)', () => {
    it("clears the rewritten resources' recorded item contributions, so a rolled total gets the talent added on top", () => {
        const actor = character();
        sync(actor, [FATED]);
        // The builder writes the rolled Fate absolutely, together with the reset.
        applyUpdate(actor, { 'system.fate.max': 3, 'system.fate.value': 3, ...resetItemResourceDeltas(actor.flags, new Set<OriginResource>(['fate'])) });
        sync(actor, [FATED]);
        expect(actor.system.fate).toEqual({ max: 4, value: 4 });
    });
});

describe('itemResourceHolders / contributesItemModifiers', () => {
    const base = { isOriginPath: false, isTalent: false, isTrait: false, isCondition: false, isSpecialAbility: false };
    const item = (over: Partial<ResourceBearingItem>): ResourceBearingItem => ({ ...base, id: 'i000000000000001', type: 'gear', system: {}, ...over });

    it('talents, traits, conditions and special abilities always apply; armour, cybernetics and gear only while equipped', () => {
        expect(contributesItemModifiers(item({ type: 'talent', isTalent: true }))).toBe(true);
        expect(contributesItemModifiers(item({ type: 'trait', isTrait: true }))).toBe(true);
        expect(contributesItemModifiers(item({ type: 'condition', isCondition: true }))).toBe(true);
        expect(contributesItemModifiers(item({ type: 'specialAbility', isSpecialAbility: true }))).toBe(true);
        for (const type of ['armour', 'cybernetic', 'gear']) {
            expect(contributesItemModifiers(item({ type, system: { state: { equipped: true } } }))).toBe(true);
            expect(contributesItemModifiers(item({ type, system: { state: { equipped: false } } }))).toBe(false);
        }
        expect(contributesItemModifiers(item({ type: 'weapon', system: { state: { equipped: true } } }))).toBe(false);
    });

    it('leaves origin paths out: they keep their own ledger bag', () => {
        const origin = item({ type: 'originPath', isOriginPath: true, isTalent: false, system: { modifiers: { resources: { fate: 1 } } } });
        const talent = item({ id: 't000000000000001', type: 'talent', isTalent: true, system: { modifiers: { resources: { fate: 1 } } } });
        expect(itemResourceHolders([origin, talent])).toEqual([{ id: 't000000000000001', contributes: true, resources: { fate: 1 } }]);
    });

    it('skips an item without an id', () => {
        expect(itemResourceHolders([item({ id: null, type: 'talent', isTalent: true })])).toEqual([]);
    });
});
