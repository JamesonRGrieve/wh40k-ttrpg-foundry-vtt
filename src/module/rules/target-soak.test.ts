import { describe, expect, it } from 'vitest';
import { locationSoak, npcArmourAP, soakRows } from './target-soak.ts';

const LOCATIONS = { head: 2, body: 5, leftArm: 3, rightArm: 3, leftLeg: 1, rightLeg: 1 };

/** The armour and Toughness Bonus a hit meets, for a PC or an NPC alike (#248). */
describe('locationSoak', () => {
    it('reads an NPC in simple mode: its flat AP at any location, and its Toughness Bonus', () => {
        const npc = { armour: { mode: 'simple' as const, total: 3, authored: true, locations: LOCATIONS }, characteristics: { toughness: { bonus: 3 } } };
        expect(locationSoak(npc, 'body')).toEqual({ armour: 3, parts: [{ key: 'statBlock', value: 3 }], toughnessBonus: 3 });
        expect(locationSoak(npc, 'head').armour).toBe(3);
    });

    it("reads an NPC in locations mode: the struck location's AP", () => {
        const npc = { armour: { mode: 'locations' as const, total: 0, authored: true, locations: LOCATIONS }, characteristics: { toughness: { bonus: 4 } } };
        expect(locationSoak(npc, 'body')).toMatchObject({ armour: 5, toughnessBonus: 4 });
        expect(locationSoak(npc, 'Right Arm')).toMatchObject({ armour: 3, toughnessBonus: 4 });
    });

    it("reads a PC's worn AP and TB, as before", () => {
        const pc = { armour: { body: { value: 4, toughnessBonus: 3 }, head: { value: 2, toughnessBonus: 3 } } };
        expect(locationSoak(pc, 'body')).toEqual({ armour: 4, parts: [{ key: 'worn', value: 4 }], toughnessBonus: 3 });
        expect(locationSoak(pc, 'Head').armour).toBe(2);
    });

    it("adds a PC's Machine 4 to worn AP 3 (they stack)", () => {
        const pc = { armour: { body: { value: 3, toughnessBonus: 3, traitBonus: 4, cyberneticAP: 0, goodArmourBonus: 0 } } };
        expect(locationSoak(pc, 'body')).toEqual({
            armour: 7,
            parts: [
                { key: 'worn', value: 3 },
                { key: 'trait', value: 4 },
            ],
            toughnessBonus: 3,
        });
    });

    it("adds a PC's Natural Armour, its cybernetic AP and Good armour's first-attack AP", () => {
        const pc = { armour: { body: { value: 4, toughnessBonus: 3, traitBonus: 2, cyberneticAP: 1, goodArmourBonus: 1 } } };
        expect(locationSoak(pc, 'body').armour).toBe(8);
    });

    it('soaks nothing at a location the target does not armour', () => {
        expect(locationSoak({ armour: {} }, 'body')).toEqual({ armour: 0, parts: [], toughnessBonus: 0 });
    });
});

describe('soakRows (the Effective line, row by row)', () => {
    const parts = [
        { key: 'worn' as const, value: 3 },
        { key: 'trait' as const, value: 4 },
    ];

    it('lists the damage, each armour part, what Penetration takes back, and TB — summing to what gets through', () => {
        const rows = soakRows(15, parts, 0, 2, 3, false);
        expect(rows.map((row) => [row.labelKey, row.value])).toEqual([
            ['WH40K.Chat.Damage.Soak.Damage', 15],
            ['WH40K.Chat.Damage.Soak.Worn', -3],
            ['WH40K.Chat.Damage.Soak.Trait', -4],
            ['WH40K.Chat.Damage.Soak.Penetration', 2],
            ['WH40K.Chat.Damage.Soak.Toughness', -3],
        ]);
        // 15 − (7 − 2) − 3 = 7.
        expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(7);
    });

    it('lets Penetration take back no more than the armour', () => {
        expect(soakRows(10, parts, 0, 12, 3, false).find((row) => row.labelKey === 'WH40K.Chat.Damage.Soak.Penetration')?.value).toBe(7);
    });

    it('drops the armour rows when the weapon ignores armour', () => {
        expect(soakRows(10, parts, 2, 4, 3, true).map((row) => row.labelKey)).toEqual(['WH40K.Chat.Damage.Soak.Damage', 'WH40K.Chat.Damage.Soak.Toughness']);
    });
});

describe('npcArmourAP', () => {
    it('is the flat total in simple mode, the location value in locations mode', () => {
        expect(npcArmourAP({ mode: 'simple', total: 6, locations: LOCATIONS }, 'leftLeg')).toBe(6);
        expect(npcArmourAP({ mode: 'locations', total: 6, locations: LOCATIONS }, 'leftLeg')).toBe(1);
        expect(npcArmourAP({ mode: 'locations', total: 6, locations: LOCATIONS }, 'tail')).toBe(0);
    });
});
