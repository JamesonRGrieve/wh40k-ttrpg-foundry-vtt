import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartRows, lookupVehicleCritical } from './vehicle-critical-tables.ts';

interface StubTable {
    _id: string;
    name: string;
    location: string;
    results: { range: number[]; description: string }[];
}

/** A RollTable pack carrying the given charts, flagged as the packs flag them. */
function pack(collection: string, tables: StubTable[]): object {
    return {
        collection,
        metadata: { type: 'RollTable', packageName: 'wh40k-rpg' },
        getIndex: vi.fn(async () =>
            Promise.resolve(
                tables.map((table) => ({ _id: table._id, name: table.name, flags: { 'wh40k-rpg': { vehicleCritical: { location: table.location } } } })),
            ),
        ),
        getDocument: async (id: string) => {
            const table = tables.find((candidate) => candidate._id === id);
            return Promise.resolve(table === undefined ? null : { name: table.name, uuid: `Compendium.${collection}.RollTable.${id}`, results: table.results });
        },
    };
}

const HULL: StubTable = {
    _id: 'hull',
    name: 'Hull Critical Hit Effects',
    location: 'hull',
    results: [
        { range: [1, 1], description: '<p>Jolted.</p>' },
        { range: [2, 9], description: '<p>Damaged.</p>' },
        { range: [10, 999], description: '<p>Destroyed.</p>' },
    ],
};

const RT_CHART: StubTable = {
    _id: 'rt',
    name: 'Vehicle Critical Hit Chart',
    location: 'any',
    results: [
        { range: [1, 2], description: '<p>Jarring Blow.</p>' },
        { range: [8, 10], description: '<p>Explodes.</p>' },
    ],
};

describe('lookupVehicleCritical (charts found by their vehicleCritical flag)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            packs: [pack('wh40k-rpg.dh2-core-rolltables', [HULL]), pack('wh40k-rpg.rt-storm-rolltables', [RT_CHART]), pack('wh40k-rpg.ow-core-rolltables', [])],
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the row of the struck location's chart in the vehicle's line", async () => {
        expect(await lookupVehicleCritical('dh2', 'hull', 4)).toEqual({
            chartName: 'Hull Critical Hit Effects',
            chartUuid: 'Compendium.wh40k-rpg.dh2-core-rolltables.RollTable.hull',
            value: 4,
            text: '<p>Damaged.</p>',
        });
    });

    it("falls back to a line's single chart for any location", async () => {
        expect((await lookupVehicleCritical('rt', 'turret', 9))?.text).toBe('<p>Explodes.</p>');
    });

    it('lands a total past the last row on the last row', async () => {
        expect((await lookupVehicleCritical('rt', 'hull', 23))?.text).toBe('<p>Explodes.</p>');
    });

    it("is null when the line's packs carry no such chart", async () => {
        expect(await lookupVehicleCritical('ow', 'motive', 3)).toBeNull();
        expect(await lookupVehicleCritical('bc', 'hull', 3)).toBeNull();
    });
});

describe('chartRows', () => {
    it('reads each result range and text, skipping a result with no range', () => {
        expect(
            chartRows([
                { range: [1, 2], description: 'a' },
                { range: [], text: 'b' },
                { range: [3, 3], name: 'c' },
            ]),
        ).toEqual([
            { min: 1, max: 2, text: 'a' },
            { min: 3, max: 3, text: 'c' },
        ]);
    });
});
