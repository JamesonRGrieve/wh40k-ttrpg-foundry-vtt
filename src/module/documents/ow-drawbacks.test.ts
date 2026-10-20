import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGIMENT_BUDGET } from '../rules/ow-regiment-creation.ts';
import { buildDrawbackPanel } from '../rules/ow-regiment-drawback.ts';

/**
 * Regimental Drawbacks on an Only War character (#160): which items are
 * drawbacks, what each returns to the Regiment Creation budget (its
 * `regimentPoints`), resolving the recorded UUIDs, adding one, and the compendium
 * picker's filter. Foundry's `Item` and `fromUuid` are stubbed.
 */

vi.mock('./compendium-pick.ts', () => ({ pickCompendiumItemUuid: vi.fn() }));

const { addRegimentalDrawback, drawbackDescriptor, isDrawbackIndexEntry, isRegimentalDrawback, resolveDrawbackDescriptors } = await import('./ow-drawbacks.ts');

class StubItem {
    readonly type: string;
    readonly uuid: string;
    readonly system: { step: string; regimentPoints: number | null; modifiers: { resources: { wounds: number } } };
    constructor(uuid: string, step: string, regimentPoints: number | null, wounds = 0) {
        this.type = 'originPath';
        this.uuid = uuid;
        this.system = { step, regimentPoints, modifiers: { resources: { wounds } } };
    }
}

const DOOMED = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.doomed';
const THE_FEW = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.the-few';
const UNRECORDED = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.unrecorded';
const HOME_WORLD = 'Compendium.wh40k-rpg.ow-origins.Item.agri-world';

const documents = new Map<string, StubItem>([
    [DOOMED, new StubItem(DOOMED, 'regimentalDrawback', 4)],
    [THE_FEW, new StubItem(THE_FEW, 'regimentalDrawback', 2)],
    [UNRECORDED, new StubItem(UNRECORDED, 'regimentalDrawback', null)],
    [HOME_WORLD, new StubItem(HOME_WORLD, 'homeWorld', 3)],
]);

beforeEach(() => {
    vi.stubGlobal('Item', StubItem);
    vi.stubGlobal('fromUuid', async (uuid: string) => Promise.resolve(documents.get(uuid) ?? null));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isRegimentalDrawback', () => {
    it('is an origin-path item on the regimentalDrawback step', () => {
        expect(isRegimentalDrawback(new StubItem(DOOMED, 'regimentalDrawback', 4))).toBe(true);
        expect(isRegimentalDrawback(new StubItem(HOME_WORLD, 'homeWorld', 3))).toBe(false);
        expect(isRegimentalDrawback({ type: 'talent', system: { step: 'regimentalDrawback' } })).toBe(false);
        expect(isRegimentalDrawback(null)).toBe(false);
    });
});

describe('drawbackDescriptor', () => {
    it('returns the item’s Regiment Creation Points as its refund', () => {
        expect(drawbackDescriptor(new StubItem(DOOMED, 'regimentalDrawback', 4), DOOMED)).toEqual({ id: DOOMED, description: '', refund: 4, penalty: {} });
    });

    it('carries the drawback’s wound change from modifiers.resources.wounds onto the panel’s penalty row (#688)', () => {
        const descriptor = drawbackDescriptor(new StubItem(DOOMED, 'regimentalDrawback', 4, -2), DOOMED);
        expect(descriptor).toEqual({ id: DOOMED, description: '', refund: 4, penalty: { wounds: -2 } });
        const panel = buildDrawbackPanel(
            [DOOMED],
            null,
            () => descriptor,
            (id) => id,
            REGIMENT_BUDGET,
        );
        expect({ hasPenaltyRow: panel.hasPenaltyRow, wounds: panel.penalty.wounds }).toEqual({ hasPenaltyRow: true, wounds: -2 });
    });

    it('is undefined while the item has not recorded its points', () => {
        expect(drawbackDescriptor(new StubItem(UNRECORDED, 'regimentalDrawback', null), UNRECORDED)).toBeUndefined();
    });
});

describe('resolveDrawbackDescriptors and the panel refund total', () => {
    it('resolves each recorded drawback with points, and leaves out the rest', async () => {
        const descriptors = await resolveDrawbackDescriptors([DOOMED, UNRECORDED, HOME_WORLD, 'Compendium.gone']);
        expect([...descriptors.keys()]).toEqual([DOOMED]);
    });

    it('totals every drawback’s refund into the adjusted budget', async () => {
        const ids = [DOOMED, THE_FEW];
        const descriptors = await resolveDrawbackDescriptors(ids);
        const panel = buildDrawbackPanel(
            ids,
            null,
            (id) => descriptors.get(id),
            (id) => id,
            REGIMENT_BUDGET,
        );
        expect(panel.drawbacks.map((row) => row.refundLabel)).toEqual(['+4', '+2']);
        expect(panel.appliedRefundLabel).toBe('+6');
        expect(panel.adjustedBudgetLabel).toBe(String(REGIMENT_BUDGET + 6));
    });

    it('keeps the totals unknown while any drawback’s points are unrecorded', async () => {
        const ids = [DOOMED, UNRECORDED];
        const descriptors = await resolveDrawbackDescriptors(ids);
        const panel = buildDrawbackPanel(
            ids,
            null,
            (id) => descriptors.get(id),
            (id) => id,
            REGIMENT_BUDGET,
        );
        expect(panel.drawbacks.map((row) => row.refundLabel)).toEqual(['+4', '—']);
        expect(panel.appliedRefundLabel).toBe('—');
    });
});

describe('addRegimentalDrawback', () => {
    function holder(held: string[]): {
        system: { regimentDrawbacks: string[] };
        writes: string[][];
        update: (data: { 'system.regimentDrawbacks': string[] }) => Promise<object>;
    } {
        const actor = {
            system: { regimentDrawbacks: held },
            writes: [] as string[][],
            update: async (data: { 'system.regimentDrawbacks': string[] }): Promise<object> => {
                actor.writes.push(data['system.regimentDrawbacks']);
                return Promise.resolve({});
            },
        };
        return actor;
    }

    it('appends the drawback to the regiment’s list', async () => {
        const actor = holder([DOOMED]);
        expect(await addRegimentalDrawback(actor, THE_FEW)).toBe(true);
        expect(actor.writes).toEqual([[DOOMED, THE_FEW]]);
    });

    it('refuses a drawback the regiment already took, writing nothing', async () => {
        const actor = holder([DOOMED]);
        expect(await addRegimentalDrawback(actor, DOOMED)).toBe(false);
        expect(actor.writes).toEqual([]);
    });
});

describe('isDrawbackIndexEntry', () => {
    it('matches an origin-path index entry on the drawback step only', () => {
        expect(isDrawbackIndexEntry({ _id: 'a', name: 'Doomed', type: 'originPath', system: { step: 'regimentalDrawback' } })).toBe(true);
        expect(isDrawbackIndexEntry({ _id: 'b', name: 'Agri-World', type: 'originPath', system: { step: 'homeWorld' } })).toBe(false);
        expect(isDrawbackIndexEntry({ _id: 'c', name: 'Doomed', type: 'talent', system: { step: 'regimentalDrawback' } })).toBe(false);
        expect(isDrawbackIndexEntry({ _id: 'd', name: 'No index fields', type: 'originPath' })).toBe(false);
    });
});
