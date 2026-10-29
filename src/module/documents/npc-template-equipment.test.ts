import { afterAll, describe, expect, it, vi } from 'vitest';
import { installFoundryDataStub } from '../testing/foundry-data-stub.ts';
import { packMetadata } from '../testing/pack-metadata.ts';
import type { EquipmentCandidate } from './npc-template-equipment.ts';

/**
 * An NPC Template's carried equipment on the NPC made from it (#670). A name that is
 * exactly one carried compendium item on the NPC's line becomes an owned item linked
 * to it; any other entry stays a named entry on the NPC.
 *
 * The storage-location model the carried types come from builds its schema at load,
 * so the recording stub is installed before the dynamic import.
 */

/** A two-level merge, as `foundry.utils.mergeObject` merges the `system` and `_stats` it is given. */
type Source = Record<string, object | string | number>;
function mergeTwoLevels(base: Source, other: Record<string, object>): Source {
    const merged: Source = { ...base };
    for (const [key, value] of Object.entries(other)) {
        const current = merged[key];
        merged[key] = typeof current === 'object' ? { ...current, ...value } : value;
    }
    return merged;
}

afterAll(installFoundryDataStub({ utils: { mergeObject: mergeTwoLevels } }));

const { linkedOwnedItemData, splitTemplateEquipment } = await import('./npc-template-equipment.ts');

/** A carried-item candidate from a pack named `packName`, flagged as one of `line`'s packs. */
const candidate = (name: string, type: string, packName: string, line: string, homebrew = false): EquipmentCandidate => ({
    uuid: `Compendium.wh40k-rpg.${packName}.Item.${name.replace(/\W/g, '')}`,
    pack: packMetadata(packName, line, type, homebrew),
    type,
    name,
});

const CANDIDATES = [
    candidate('Flak Armour', 'armour', 'dh2-armour', 'dh2'),
    candidate('Flak Armour', 'armour', 'rt-armour', 'rt'),
    candidate('Autogun', 'weapon', 'dh2-weapons', 'dh2'),
    candidate('Autogun', 'weapon', 'dh2-more-weapons', 'dh2'),
    candidate('Stummer', 'gear', 'dh2-homebrew-gear', 'dh2', true),
    candidate('Hatred', 'talent', 'dh2-talents', 'dh2'),
];

describe('splitTemplateEquipment', () => {
    const split = splitTemplateEquipment(
        [
            { name: 'Flak Armour', quantity: 1 },
            { name: 'Stummer', quantity: 2 },
            { name: 'Autogun', quantity: 1 },
            { name: 'Hatred', quantity: 1 },
            { name: 'Ration Pack', quantity: 3 },
        ],
        CANDIDATES,
        'dh2',
    );

    it("links a name that is one carried item on the NPC's line, or its homebrew packs, with its quantity", () => {
        expect(split.owned).toEqual([
            { uuid: 'Compendium.wh40k-rpg.dh2-armour.Item.FlakArmour', quantity: 1 },
            { uuid: 'Compendium.wh40k-rpg.dh2-homebrew-gear.Item.Stummer', quantity: 2 },
        ]);
    });

    it('lists a name with several matches, a non-carried match, or none', () => {
        expect(split.listed).toEqual([
            { name: 'Autogun', quantity: 1 },
            { name: 'Hatred', quantity: 1 },
            { name: 'Ration Pack', quantity: 3 },
        ]);
    });

    it("never links another line's item", () => {
        expect(splitTemplateEquipment([{ name: 'Flak Armour', quantity: 1 }], CANDIDATES, 'bc')).toEqual({
            owned: [],
            listed: [{ name: 'Flak Armour', quantity: 1 }],
        });
    });
});

describe('linkedOwnedItemData', () => {
    class StubItem {
        constructor(readonly source: { _id: string; name: string; type: string; system: object }) {}

        toObject(): { _id: string; name: string; type: string; system: object } {
            return structuredClone(this.source);
        }
    }
    const documents: Record<string, StubItem> = {
        'uuid.flak': new StubItem({ _id: 'flak', name: 'Flak Armour', type: 'armour', system: { quantity: 1, ap: 4 } }),
        'uuid.hatred': new StubItem({ _id: 'hatred', name: 'Hatred', type: 'talent', system: { tier: 2 } }),
    };
    vi.stubGlobal('Item', StubItem);
    vi.stubGlobal('fromUuid', async (uuid: string): Promise<StubItem | null> => Promise.resolve(documents[uuid] ?? null));
    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('links each item to its document, sets a carried quantity, and skips a UUID that resolves to nothing', async () => {
        const data = await linkedOwnedItemData([{ uuid: 'uuid.flak', quantity: 3 }, { uuid: 'uuid.hatred' }, { uuid: 'uuid.missing', quantity: 1 }]);
        expect(data).toEqual([
            { name: 'Flak Armour', type: 'armour', system: { quantity: 3, ap: 4 }, _stats: { compendiumSource: 'uuid.flak' } },
            { name: 'Hatred', type: 'talent', system: { tier: 2 }, _stats: { compendiumSource: 'uuid.hatred' } },
        ]);
    });
});
