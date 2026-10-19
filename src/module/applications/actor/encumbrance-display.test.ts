import { describe, expect, it } from 'vitest';
import { encumbranceDisplay } from './encumbrance-display.ts';

/**
 * The Inventory tab's Carry bar context (#545). A PC's document tracks encumbrance
 * through its `encumbrance` getter and gets the bar; an NPC's document has none, so
 * the sheet tells the template to draw no bar.
 */

describe('encumbranceDisplay', () => {
    it('tells the template an actor without encumbrance (an NPC) has no bar, and gives no percentages', () => {
        expect(encumbranceDisplay({ name: 'Cult Demagogue' })).toEqual({ tracksEncumbrance: false });
    });

    it('gives an actor that tracks encumbrance the bar with its load and backpack fill', () => {
        const actor = { encumbrance: { value: 30, max: 60, over: false, backpack_value: 9, backpack_max: 12 } };
        expect(encumbranceDisplay(actor)).toEqual({ tracksEncumbrance: true, encumbrancePercent: 50, backpackPercent: 75 });
    });

    it('caps the fill at 100%, and counts a missing or zero maximum as 1', () => {
        expect(encumbranceDisplay({ encumbrance: { value: 90, max: 60, over: true } })).toEqual({
            tracksEncumbrance: true,
            encumbrancePercent: 100,
            backpackPercent: 0,
        });
        expect(encumbranceDisplay({ encumbrance: { value: 0, max: 0, over: false, backpack_value: 0, backpack_max: 0 } })).toEqual({
            tracksEncumbrance: true,
            encumbrancePercent: 0,
            backpackPercent: 0,
        });
    });

    it('still shows the bar for a PC carrying nothing', () => {
        expect(encumbranceDisplay({ encumbrance: { value: 0, max: 45, over: false } }).tracksEncumbrance).toBe(true);
    });
});
