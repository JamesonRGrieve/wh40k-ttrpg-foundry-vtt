import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartRows, lookupCriticalChart, lookupVehicleCritical, packFolderId } from './vehicle-critical-tables.ts';

interface StubTable {
    _id: string;
    name: string;
    location: string;
    results: { range: number[]; description: string }[];
}

/** A roll-table pack's metadata: its name and the line its manifest flags declare. */
function tableMetadata(line: string, name: string): object {
    return { name, flags: { 'wh40k-rpg': { line, category: 'rolltables', homebrew: false } } };
}

/** One of `line`'s roll-table packs carrying the given charts, flagged as the packs flag them. */
function pack(line: string, name: string, tables: StubTable[]): object {
    const collection = `wh40k-rpg.${name}`;
    return {
        metadata: tableMetadata(line, name),
        folder: null,
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
            packs: [pack('dh2', 'dh2-tables', [HULL]), pack('rt', 'rt-tables', [RT_CHART]), pack('ow', 'ow-tables', [])],
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the row of the struck location's chart in the vehicle's line", async () => {
        expect(await lookupVehicleCritical('dh2', 'hull', 4)).toEqual({
            chartName: 'Hull Critical Hit Effects',
            chartUuid: 'Compendium.wh40k-rpg.dh2-tables.RollTable.hull',
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

/** A BC roll-table pack, in book folder `folder`, carrying a creature critical chart flagged `criticalChart`. */
function criticalChartPack(name: string, folder: string, text: string): object {
    const collection = `wh40k-rpg.${name}`;
    return {
        metadata: tableMetadata('bc', name),
        folder: { id: folder },
        getIndex: vi.fn(async () =>
            Promise.resolve([{ _id: 'de', name: 'Daemon Engine Critical Hit Chart', flags: { 'wh40k-rpg': { criticalChart: 'daemon-engine' } } }]),
        ),
        getDocument: async () =>
            Promise.resolve({
                name: 'Daemon Engine Critical Hit Chart',
                uuid: `Compendium.${collection}.RollTable.de`,
                results: [
                    { range: [1, 3], description: '<p>Distracting Blow.</p>' },
                    { range: [10, 10], description: `<p>${text}</p>` },
                ],
            }),
    };
}

describe('lookupCriticalChart (a creature trait names its critical chart, #678)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            packs: [
                criticalChartPack('bc-tables-a', 'book-a', 'Daemon Unbound (A).'),
                criticalChartPack('bc-tables-b', 'book-b', 'Daemon Unbound (B).'),
                pack('dh2', 'dh2-tables', [HULL]),
            ],
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the chart from the creature's own book folder, a total past the last row landing on it", async () => {
        expect(await lookupCriticalChart('daemon-engine', 'bc', 'book-b', 12)).toEqual({
            chartName: 'Daemon Engine Critical Hit Chart',
            chartUuid: 'Compendium.wh40k-rpg.bc-tables-b.RollTable.de',
            value: 12,
            text: '<p>Daemon Unbound (B).</p>',
        });
    });

    it("falls back to the line's first printing for a creature from another book", async () => {
        expect((await lookupCriticalChart('daemon-engine', 'bc', 'book-c', 10))?.text).toBe('<p>Daemon Unbound (A).</p>');
    });

    it("is null when the line's packs carry no chart with that flag", async () => {
        expect(await lookupCriticalChart('daemon-engine', 'dh2', null, 3)).toBeNull();
    });
});

describe('packFolderId', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('names the book folder an installed pack sits in, or null', () => {
        const packs = new Map<string, object>([
            ['wh40k-rpg.a', { folder: { id: 'book-a' } }],
            ['wh40k-rpg.b', { folder: null }],
        ]);
        vi.stubGlobal('game', { packs });
        expect([packFolderId('wh40k-rpg.a'), packFolderId('wh40k-rpg.b'), packFolderId('wh40k-rpg.missing')]).toEqual(['book-a', null, null]);
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
