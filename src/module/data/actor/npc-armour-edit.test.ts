/**
 * Regression guard: NPC armour a GM enters must survive the Toughness +
 * worn-item derivation, while a sheet save's echo of the derived armour must
 * not freeze it. Before this, every non-authored NPC silently re-derived over a
 * typed armour value (an NPC set to 4 AP took full damage; a sheet edit to 1
 * read back 0).
 */
import { describe, expect, it } from 'vitest';
import { isAuthoredOnCreate, type NpcArmour, resolveArmourEdit } from './npc-armour-edit.ts';

const derived = (over: Partial<NpcArmour> = {}): NpcArmour => ({
    mode: 'locations',
    total: 3,
    authored: false,
    locations: { head: 3, body: 3, leftArm: 3, rightArm: 3, leftLeg: 3, rightLeg: 3 },
    ...over,
});

describe('resolveArmourEdit', () => {
    it('marks a changed total as authored', () => {
        expect(resolveArmourEdit({ total: 1 }, derived())).toEqual({ total: 1, authored: true });
    });

    it('marks a changed single location as authored, keeping the echoed rest', () => {
        const patch = { locations: { head: 3, body: 6, leftArm: 3 } };
        expect(resolveArmourEdit(patch, derived())).toEqual({ ...patch, authored: true });
    });

    it('marks a mode switch as authored', () => {
        expect(resolveArmourEdit({ mode: 'simple' }, derived())).toEqual({ mode: 'simple', authored: true });
    });

    it('drops a pure echo of the derived values instead of persisting them', () => {
        expect(resolveArmourEdit({ mode: 'locations', total: 3, locations: { head: 3, body: 3 } }, derived())).toBeNull();
    });

    it('passes an already-authored NPC edit through untouched', () => {
        const patch = { total: 3 };
        expect(resolveArmourEdit(patch, derived({ authored: true }))).toBe(patch);
    });

    it('respects an explicit authored flag in the patch', () => {
        const patch = { total: 9, authored: false };
        expect(resolveArmourEdit(patch, derived())).toBe(patch);
    });
});

describe('isAuthoredOnCreate', () => {
    it('treats a non-zero total as authored', () => {
        expect(isAuthoredOnCreate({ mode: 'simple', total: 4 })).toBe(true);
    });

    it('treats a non-zero location as authored', () => {
        expect(isAuthoredOnCreate({ locations: { head: 0, body: 2 } })).toBe(true);
    });

    it('leaves all-zero or absent armour to the derivation', () => {
        expect(isAuthoredOnCreate({ mode: 'simple', total: 0, locations: { body: 0 } })).toBe(false);
        expect(isAuthoredOnCreate(undefined)).toBe(false);
    });

    it('defers to an explicit authored flag', () => {
        expect(isAuthoredOnCreate({ total: 4, authored: false })).toBe(false);
    });
});
