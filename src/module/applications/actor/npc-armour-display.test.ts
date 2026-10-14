/**
 * The NPC armour block read per hit location for the silhouette (#611). Before
 * this, the silhouette read the PC shape off an NPC and showed 0 everywhere.
 */

import { describe, expect, it } from 'vitest';
import { npcArmourAtLocation } from './npc-armour-display.ts';

const LOCATIONS = { head: 2, body: 5, leftArm: 4, rightArm: 4, leftLeg: 3, rightLeg: 3 };

describe('npcArmourAtLocation', () => {
    it('reads a location-mode AP and adds Toughness to the total', () => {
        expect(npcArmourAtLocation({ mode: 'locations', total: 5, locations: LOCATIONS }, 'body', 3)).toEqual({
            value: 5,
            total: 8,
            toughnessBonus: 3,
            traitBonus: 0,
        });
        expect(npcArmourAtLocation({ mode: 'locations', total: 5, locations: LOCATIONS }, 'head', 3)).toEqual({
            value: 2,
            total: 5,
            toughnessBonus: 3,
            traitBonus: 0,
        });
    });

    it('reads the flat total on every location in simple mode', () => {
        expect(npcArmourAtLocation({ mode: 'simple', total: 4, locations: LOCATIONS }, 'leftLeg', 2)).toEqual({
            value: 4,
            total: 6,
            toughnessBonus: 2,
            traitBonus: 0,
        });
    });

    it('reads 0 AP at a location the block does not carry', () => {
        expect(npcArmourAtLocation({ mode: 'locations', total: 0, locations: LOCATIONS }, 'tail', 3)).toEqual({
            value: 0,
            total: 3,
            toughnessBonus: 3,
            traitBonus: 0,
        });
    });
});
