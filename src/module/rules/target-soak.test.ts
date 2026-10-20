import { describe, expect, it } from 'vitest';
import { locationSoak, npcArmourAP } from './target-soak.ts';

const LOCATIONS = { head: 2, body: 5, leftArm: 3, rightArm: 3, leftLeg: 1, rightLeg: 1 };

/** The armour and Toughness Bonus a hit meets, for a PC or an NPC alike (#248). */
describe('locationSoak', () => {
    it('reads an NPC in simple mode: its flat AP at any location, and its Toughness Bonus', () => {
        const npc = { armour: { mode: 'simple' as const, total: 3, authored: true, locations: LOCATIONS }, characteristics: { toughness: { bonus: 3 } } };
        expect(locationSoak(npc, 'body')).toEqual({ armour: 3, toughnessBonus: 3 });
        expect(locationSoak(npc, 'head')).toEqual({ armour: 3, toughnessBonus: 3 });
    });

    it("reads an NPC in locations mode: the struck location's AP", () => {
        const npc = { armour: { mode: 'locations' as const, total: 0, authored: true, locations: LOCATIONS }, characteristics: { toughness: { bonus: 4 } } };
        expect(locationSoak(npc, 'body')).toEqual({ armour: 5, toughnessBonus: 4 });
        expect(locationSoak(npc, 'Right Arm')).toEqual({ armour: 3, toughnessBonus: 4 });
    });

    it("reads a PC's prepared per-location armour, as before", () => {
        const pc = { armour: { body: { value: 4, toughnessBonus: 3 }, head: { value: 2, toughnessBonus: 3 } } };
        expect(locationSoak(pc, 'body')).toEqual({ armour: 4, toughnessBonus: 3 });
        expect(locationSoak(pc, 'Head')).toEqual({ armour: 2, toughnessBonus: 3 });
    });

    it('soaks nothing at a location the target does not armour', () => {
        expect(locationSoak({ armour: {} }, 'body')).toEqual({ armour: 0, toughnessBonus: 0 });
    });
});

describe('npcArmourAP', () => {
    it('is the flat total in simple mode, the location value in locations mode', () => {
        expect(npcArmourAP({ mode: 'simple', total: 6, locations: LOCATIONS }, 'leftLeg')).toBe(6);
        expect(npcArmourAP({ mode: 'locations', total: 6, locations: LOCATIONS }, 'leftLeg')).toBe(1);
        expect(npcArmourAP({ mode: 'locations', total: 6, locations: LOCATIONS }, 'tail')).toBe(0);
    });
});
