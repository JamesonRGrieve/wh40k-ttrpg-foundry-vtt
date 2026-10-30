import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollTableUtils } from './roll-table-utils.ts';

/**
 * The out-of-range clamp and the ladder escalation of `RollTableUtils.rollTable`
 * (#187). Foundry hands `table.results` over as an EmbeddedCollection, not an
 * Array; the old `Array.isArray` guard made both dead in play, so a Crippled
 * ship's critical valued past the ship Critical Hit table (or any modified roll past a table's
 * last row) drew nothing.
 */

interface Row {
    readonly name: string;
    readonly range: [number, number];
}

/** A Collection stand-in: iterable and sized, but not an Array. */
class RowCollection implements Iterable<Row> {
    readonly #rows: Row[];
    constructor(rows: Row[]) {
        this.#rows = rows;
    }
    get size(): number {
        return this.#rows.length;
    }
    [Symbol.iterator](): Iterator<Row> {
        return this.#rows[Symbol.iterator]();
    }
}

const ROWS: Row[] = [
    { name: 'Holed', range: [1, 1] },
    { name: 'Hull Breach', range: [9, 10] },
    { name: 'Catastrophic Damage', range: [11, 11] },
];

function stubTable(drawn: Row[], total: number): void {
    const table = {
        results: new RowCollection(ROWS),
        roll: async () => Promise.resolve({ roll: { total }, results: [...drawn] }),
        toMessage: async () => Promise.resolve(),
    };
    vi.stubGlobal('game', { tables: { getName: () => table }, i18n: { format: (key: string) => key } });
    vi.stubGlobal('ui', { notifications: { warn: vi.fn() } });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

/** The names of the rows a draw resolved to. */
async function drawnNames(escalateRows = 0): Promise<string[]> {
    const drawn = await RollTableUtils.rollTable('Ship Critical Hits', { displayChat: false, escalateRows });
    return (drawn?.results ?? []).map((result) => result.name);
}

describe('RollTableUtils.rollTable over a results Collection', () => {
    it('clamps a roll past the last row onto it', async () => {
        stubTable([], 14);
        expect(await drawnNames()).toEqual(['Catastrophic Damage']);
    });

    it('clamps a roll below the first row onto it', async () => {
        stubTable([], -2);
        expect(await drawnNames()).toEqual(['Holed']);
    });

    it('escalates a drawn row down the ladder', async () => {
        stubTable(ROWS.slice(0, 1), 1);
        expect(await drawnNames(1)).toEqual(['Hull Breach']);
    });
});
