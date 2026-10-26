import { describe, expect, it } from 'vitest';
import { attachShipAssaults, findShipAssault, SHIP_ASSAULTS, shipAssaultButtons } from './ship-assault-registry.ts';

/** The sheet's ship assault buttons (#188) come from one registry. */
describe('ship-assault-registry', () => {
    it('registers every flow under a unique id', () => {
        const ids = SHIP_ASSAULTS.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(findShipAssault(id)?.id).toBe(id);
        expect(findShipAssault('nope')).toBeUndefined();
    });

    it('builds localized buttons for one tab only', () => {
        const buttons = shipAssaultButtons('manoeuvre', (key) => `L:${key}`);
        expect(buttons.map((button) => button.id)).toEqual(SHIP_ASSAULTS.filter((entry) => entry.tab === 'manoeuvre').map((entry) => entry.id));
        for (const button of buttons) expect(button.label.startsWith('L:WH40K.')).toBe(true);
    });
});

/** One action is one row (#701): Hit and Run was listed both as a resolver and as a rules card. */
describe('attachShipAssaults', () => {
    const hitAndRun = { id: 'hit-and-run', label: 'Hit and Run', hint: '', icon: 'fa-x' };
    const ram = { id: 'ramming', label: 'Ram', hint: '', icon: 'fa-x' };

    it('puts a resolver on the row whose order identifier is its id, and keeps the rest in the panel', () => {
        const { rows, unmatched } = attachShipAssaults(
            [
                { identifier: 'hit-and-run', name: 'Hit and Run' },
                { identifier: 'active-augury', name: 'Active Augury' },
            ],
            [hitAndRun, ram],
        );
        expect(rows.map((row) => [row.name, row.assault?.id ?? null])).toEqual([
            ['Hit and Run', 'hit-and-run'],
            ['Active Augury', null],
        ]);
        expect(unmatched).toEqual([ram]);
    });

    it('never pairs a row with no identifier', () => {
        const { rows, unmatched } = attachShipAssaults([{ identifier: '' }], [hitAndRun]);
        expect(rows[0]?.assault).toBeNull();
        expect(unmatched).toEqual([hitAndRun]);
    });

    it('the registered Hit and Run resolver is an Extended Action, so it meets the order on that tab', () => {
        expect(findShipAssault('hit-and-run')?.tab).toBe('extended');
    });
});
