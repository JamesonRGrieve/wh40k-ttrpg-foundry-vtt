/**
 * The in-memory join must not drop an update that reaches an item while the join
 * is still awaiting the packs (#701).
 *
 * Tier B caught it under load: an Only War character got Agri-World and a Weapon
 * Specialist, and the builder then wrote the Specialist's rolled wounds formula
 * (`system.rollResults.wounds`). The `createItem` join had already merged the
 * Specialist, then awaited the next pack. When it committed the merge as a
 * wholesale `system` replacement, the rolled result was gone and the wounds
 * maximum read 0 instead of 13.
 */
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { carryLateChanges, hydrateCreatedItemInMemory } from './compendium-hydrate.ts';

/** An origin item's system as these stubs carry it: string fields and nested objects. */
type StubSystem = Record<string, string | object>;

interface JoinItem {
    id: string;
    name: string;
    img: null;
    type: string;
    _source: { system: StubSystem };
    system: StubSystem;
    _stats: { compendiumSource: string };
    updateSource: Mock<(changes: { system?: StubSystem }, options?: object) => void>;
}

const SPECIALIST = 'Compendium.wh40k-rpg.ow-specialities.Item.specialist';
const AGRI_WORLD = 'Compendium.wh40k-rpg.ow-homeworlds.Item.agriWorld';
const ROLLED = { formula: '8+1d5', rolled: 11, breakdown: '8 + 3', timestamp: 0 };

function leanOrigin(id: string, uuid: string): JoinItem {
    const system = { step: id };
    return { id, name: id, img: null, type: 'originPath', _source: { system }, system, _stats: { compendiumSource: uuid }, updateSource: vi.fn() };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('a late update survives the in-memory join (#701)', () => {
    it("keeps a rolled wounds formula written while the join awaited the next item's pack", async () => {
        const specialist = leanOrigin('specialist', SPECIALIST);
        const agriWorld = leanOrigin('agriWorld', AGRI_WORLD);
        vi.stubGlobal(
            'fromUuid',
            vi.fn(async (uuid: string) => {
                if (uuid === SPECIALIST) return Promise.resolve({ img: null, type: 'originPath', system: { grants: { woundsFormula: '8+1d5' } } });
                // The Specialist is already merged; the rolled result lands while this pack loads.
                specialist._source.system = { ...specialist._source.system, rollResults: { wounds: ROLLED } };
                return Promise.resolve({ img: null, type: 'originPath', system: { modifiers: { resources: { wounds: 2 } } } });
            }),
        );
        const actor = { documentName: 'Actor', name: 'Agri Specialist', items: { contents: [specialist, agriWorld] }, reset: vi.fn(), render: vi.fn() };

        await expect(hydrateCreatedItemInMemory({ parent: actor })).resolves.toBe(2);

        const committed = specialist.updateSource.mock.calls[0]?.[0].system;
        expect(committed).toMatchObject({ step: 'specialist', grants: { woundsFormula: '8+1d5' }, rollResults: { wounds: ROLLED } });
    });
});

describe('carryLateChanges', () => {
    it('copies only the paths that changed after the snapshot, recursing through objects', () => {
        const merged = { grants: { woundsFormula: '8+1d5', fate: 2 }, step: 'a' };
        const snapshot = { step: 'a', grants: { fate: 2 } };
        const current = { step: 'a', grants: { fate: 3 }, rollResults: { wounds: ROLLED } };
        expect(carryLateChanges(merged, snapshot, current)).toEqual({
            grants: { woundsFormula: '8+1d5', fate: 3 },
            step: 'a',
            rollResults: { wounds: ROLLED },
        });
    });

    it('leaves the join untouched when nothing changed', () => {
        const merged = { grants: { woundsFormula: '8+1d5' }, step: 'a' };
        expect(carryLateChanges(merged, { step: 'a' }, { step: 'a' })).toEqual(merged);
    });
});
