/**
 * An NPC's armour source (#611): equipped items set AP through the PC
 * computation; an authored stat block stands only while nothing is equipped;
 * with neither, the armour its inventory lists is worn.
 */

import { describe, expect, it } from 'vitest';
import { asBaseActor } from '../../testing/actor-stub.ts';
import { deriveNpcArmour, npcArmourSource } from './npc-armour-derive.ts';

interface ItemLike {
    type: string;
    name: string;
    system: { identifier?: string; level?: number; state?: { equipped?: boolean }; hasArmourPoints?: boolean; armourPoints?: Record<string, number> };
}

const ALL = (ap: number): Record<string, number> => ({ head: ap, body: ap, leftArm: ap, rightArm: ap, leftLeg: ap, rightLeg: ap });

/** The DH2 Enforcer Light Carapace: AP 5 on every location. */
function carapace(equipped: boolean): ItemLike {
    return { type: 'armour', name: 'Enforcer Light Carapace', system: { state: { equipped }, armourPoints: ALL(5) } };
}

/** A flak vest: AP 3 on the body only. */
function flakVest(equipped: boolean): ItemLike {
    return {
        type: 'armour',
        name: 'Flak Vest',
        system: { state: { equipped }, armourPoints: { head: 0, body: 3, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 } },
    };
}

function npc(items: ItemLike[], toughnessBonus = 3): ReturnType<typeof asBaseActor> {
    return asBaseActor({
        characteristics: { toughness: { bonus: toughnessBonus } },
        items: Object.assign([...items], { filter: (predicate: (i: ItemLike) => boolean) => items.filter(predicate) }),
        getFlag: () => false,
    });
}

describe('npcArmourSource', () => {
    it('worn armour wins; then an authored stat block; then the listed items', () => {
        expect(npcArmourSource(true, true)).toBe('worn');
        expect(npcArmourSource(true, false)).toBe('worn');
        expect(npcArmourSource(false, true)).toBe('statBlock');
        expect(npcArmourSource(false, false)).toBe('listed');
    });
});

describe('deriveNpcArmour', () => {
    it('equipped items only: the carapace sets AP 5 everywhere (TB stays out of the stored AP)', () => {
        expect(deriveNpcArmour(npc([carapace(true)]), false)).toEqual({ mode: 'locations', total: 5, locations: ALL(5) });
    });

    it('stat block only: an authored NPC with nothing equipped keeps its stat block', () => {
        expect(deriveNpcArmour(npc([]), true)).toBeNull();
        expect(deriveNpcArmour(npc([carapace(false)]), true)).toBeNull();
    });

    it('both: equipped armour sets the stat block aside — counted once, never added to it', () => {
        expect(deriveNpcArmour(npc([carapace(true)]), true)).toEqual({ mode: 'locations', total: 5, locations: ALL(5) });
    });

    it('none: no stat block and no armour leaves AP 0', () => {
        expect(deriveNpcArmour(npc([]), false)).toEqual({ mode: 'locations', total: 0, locations: ALL(0) });
    });

    it('listed: an unauthored bestiary NPC wears the armour it lists, equipped or not', () => {
        expect(deriveNpcArmour(npc([carapace(false)]), false)).toEqual({ mode: 'locations', total: 5, locations: ALL(5) });
    });

    it('worn: only equipped pieces count once anything is equipped', () => {
        const derived = deriveNpcArmour(npc([flakVest(true), carapace(false)]), false);
        expect(derived?.locations).toEqual({ head: 0, body: 3, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 });
    });

    it('PC stacking: the highest piece per location counts, pieces never add', () => {
        const derived = deriveNpcArmour(npc([flakVest(true), carapace(true)]), false);
        expect(derived?.locations).toEqual(ALL(5));
    });

    it('PC trait and cybernetic rules: Natural Armour adds, an equipped armoured cybernetic adds and counts as worn', () => {
        const naturalArmour: ItemLike = { type: 'trait', name: 'Natural Armour', system: { identifier: 'naturalArmour', level: 2 } };
        const plating: ItemLike = {
            type: 'cybernetic',
            name: 'Subdermal Armour',
            system: { state: { equipped: true }, hasArmourPoints: true, armourPoints: ALL(2) },
        };
        // The cybernetic alone is worn armour, so it sets the authored stat block aside.
        expect(deriveNpcArmour(npc([naturalArmour, plating]), true)).toEqual({ mode: 'locations', total: 4, locations: ALL(4) });
        expect(deriveNpcArmour(npc([naturalArmour, plating, carapace(true)]), true)?.locations).toEqual(ALL(9));
    });

    it('an unequipped cybernetic is not worn armour', () => {
        const plating: ItemLike = {
            type: 'cybernetic',
            name: 'Subdermal Armour',
            system: { state: { equipped: false }, hasArmourPoints: true, armourPoints: ALL(2) },
        };
        expect(deriveNpcArmour(npc([plating]), true)).toBeNull();
    });
});
