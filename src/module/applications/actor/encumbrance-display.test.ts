import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
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

    it('gives an actor that tracks encumbrance the bar with its load fill', () => {
        const actor = { encumbrance: { value: 30, max: 60, over: false } };
        expect(encumbranceDisplay(actor)).toEqual({ tracksEncumbrance: true, encumbrancePercent: 50 });
    });

    it('caps the fill at 100%, and counts a zero maximum as 1', () => {
        expect(encumbranceDisplay({ encumbrance: { value: 90, max: 60, over: true } })).toEqual({ tracksEncumbrance: true, encumbrancePercent: 100 });
        expect(encumbranceDisplay({ encumbrance: { value: 0, max: 0, over: false } })).toEqual({ tracksEncumbrance: true, encumbrancePercent: 0 });
    });

    it('draws exactly one Carry bar on the Inventory tab, in the panel header, for a PC carrying a load', () => {
        // The tab once drew a second, separate load bar above the panel for any PC carrying more than 0 kg.
        const tab = readRepoFile('src/templates/actor/player/tab-equipment.hbs');
        const panel = readRepoFile('src/templates/actor/panel/backpack-split-panel.hbs');
        expect(tab).not.toContain('encumbrancePercent');
        expect(tab).not.toContain('WH40K.Common.Kilograms');
        expect(panel.match(/data-carry-bar/g)).toHaveLength(1);
    });

    it('still shows the bar for a PC carrying nothing', () => {
        expect(encumbranceDisplay({ encumbrance: { value: 0, max: 45, over: false } }).tracksEncumbrance).toBe(true);
    });
});
