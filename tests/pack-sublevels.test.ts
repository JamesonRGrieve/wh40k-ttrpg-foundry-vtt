import { describe, expect, it } from 'vitest';
import { EMBEDDED_HIERARCHY, type EmbeddedHierarchy, type PackRecord, type PackSourceDoc, packRecords } from '../scripts/lib/pack-sublevels.cjs';

/**
 * Read the records back the way Foundry V14's server does
 * (`EmbeddedCollectionField#expandEmbedded`): each embedded field holds ids,
 * each id is looked up in the sublevel `<parent sublevel>.<field>` under the
 * key `<ancestor ids>.<id>`, and an id with no record is dropped.
 */
function expand(records: PackRecord[], collection: string, id: string): PackSourceDoc | undefined {
    const byKey = new Map(records.map((r) => [r.key, r.value]));
    const load = (sublevel: string, idPath: string, hierarchy: EmbeddedHierarchy): PackSourceDoc | undefined => {
        const stored = byKey.get(`!${sublevel}!${idPath}`);
        if (stored === undefined) return undefined;
        const doc: PackSourceDoc = { ...stored };
        for (const [field, child] of Object.entries(hierarchy)) {
            const ids = doc[field];
            if (!Array.isArray(ids)) continue;
            doc[field] = ids
                .map((childId) => (typeof childId === 'string' ? load(`${sublevel}.${field}`, `${idPath}.${childId}`, child) : undefined))
                .filter((d) => d !== undefined);
        }
        return doc;
    };
    return load(collection, id, EMBEDDED_HIERARCHY[collection] ?? {});
}

const ENRAGE_EFFECT = {
    _id: 'd8e5bae3c67be728',
    name: 'Enrage',
    transfer: false,
    changes: [{ key: 'system.characteristics.weaponSkill.modifier', mode: 2, value: '-10' }],
    duration: { value: 1, units: 'rounds' },
};

describe('packRecords — a pack document split into the V14 LevelDB records', () => {
    it("writes an item's ActiveEffects to the items.effects sublevel, leaving ids on the item (the dropped psychic-power effects)", () => {
        const power = { _id: '90a4062dc6f26e17', name: 'Enrage', type: 'psychicPower', effects: [ENRAGE_EFFECT] };
        const { records, skipped } = packRecords('items', power);
        expect(skipped).toEqual([]);
        expect(records).toContainEqual({ key: '!items.effects!90a4062dc6f26e17.d8e5bae3c67be728', value: ENRAGE_EFFECT });
        expect(records).toContainEqual({ key: '!items!90a4062dc6f26e17', value: { ...power, effects: ['d8e5bae3c67be728'] } });
        expect(expand(records, 'items', power._id)).toEqual(power);
    });

    it('nests actor → item → effect sublevels, and an actor’s own effects', () => {
        const effect = { _id: 'eff0000000000001', name: 'Aura' };
        const item = { _id: 'itm0000000000001', name: 'Blade', effects: [effect] };
        const own = { _id: 'eff0000000000002', name: 'Stunned' };
        const actor = { _id: 'act0000000000001', name: 'Psyker', items: [item], effects: [own] };
        const { records } = packRecords('actors', actor);
        expect(records.map((r) => r.key).sort()).toEqual([
            '!actors!act0000000000001',
            '!actors.effects!act0000000000001.eff0000000000002',
            '!actors.items!act0000000000001.itm0000000000001',
            '!actors.items.effects!act0000000000001.itm0000000000001.eff0000000000001',
        ]);
        expect(expand(records, 'actors', actor._id)).toEqual(actor);
    });

    it('splits journal pages and categories, and table results', () => {
        const journal = { _id: 'jrn0000000000001', pages: [{ _id: 'pg00000000000001', name: 'Page' }], categories: [{ _id: 'cat0000000000001', name: 'Cat' }] };
        expect(expand(packRecords('journal', journal).records, 'journal', journal._id)).toEqual(journal);
        const table = { _id: 'tbl0000000000001', results: [{ _id: 'res0000000000001', range: [1, 5] }] };
        const { records } = packRecords('tables', table);
        expect(records).toContainEqual({ key: '!tables.results!tbl0000000000001.res0000000000001', value: table.results[0] });
        expect(expand(records, 'tables', table._id)).toEqual(table);
    });

    it('writes a collection with no embedded hierarchy (adventures) whole', () => {
        const adventure = { _id: 'adv0000000000001', items: [{ _id: 'itm0000000000001', name: 'Copy' }] };
        expect(packRecords('adventures', adventure).records).toEqual([{ key: '!adventures!adv0000000000001', value: adventure }]);
    });

    it('reports, rather than writes, an embedded document without an _id', () => {
        const power = { _id: 'pow0000000000001', effects: [{ name: 'No id' }, ENRAGE_EFFECT] };
        const { records, skipped } = packRecords('items', power);
        expect(skipped).toEqual(['items.effects in pow0000000000001']);
        expect(records.find((r) => r.key === '!items!pow0000000000001')?.value).toEqual({ ...power, effects: [ENRAGE_EFFECT._id] });
    });

    it('does not mutate the source document', () => {
        const power = { _id: 'pow0000000000002', effects: [ENRAGE_EFFECT] };
        packRecords('items', power);
        expect(power.effects).toEqual([ENRAGE_EFFECT]);
    });
});
