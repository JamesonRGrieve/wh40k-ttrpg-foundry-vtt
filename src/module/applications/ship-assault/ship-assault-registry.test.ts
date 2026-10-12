import { describe, expect, it } from 'vitest';
import { findShipAssault, SHIP_ASSAULTS, shipAssaultButtons } from './ship-assault-registry.ts';

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
