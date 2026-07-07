import { describe, expect, it } from 'vitest';
import { getJamFloor, shouldJamRoll, weaponFireBlockReason } from './weapon-jam';

describe('getJamFloor', () => {
    it('returns 96 for a Standard Attack', () => {
        expect(getJamFloor('Standard Attack')).toBe(96);
    });
    it('returns 96 for an unknown action name (defensive default)', () => {
        expect(getJamFloor('Unknown Action')).toBe(96);
    });
    it('returns 94 for Semi-Auto Burst, Full Auto Burst, Swift, Lightning, and both Suppressing variants', () => {
        for (const action of ['Semi-Auto Burst', 'Full Auto Burst', 'Suppressing Fire - Semi', 'Suppressing Fire - Full', 'Swift Attack', 'Lightning Attack']) {
            expect(getJamFloor(action)).toBe(94);
        }
    });
});

describe('shouldJamRoll', () => {
    const base = { hasReliable: false, hasUnreliable: false };

    describe('standard ranged attack', () => {
        it('does NOT jam on 95', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 95, success: false, ...base })).toBe(false);
        });
        it('jams on 96, 99, and 100', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 96, success: false, ...base })).toBe(true);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 99, success: false, ...base })).toBe(true);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 100, success: false, ...base })).toBe(true);
        });
    });

    describe('burst actions', () => {
        it('jam on 94 for Semi-Auto Burst', () => {
            expect(shouldJamRoll({ action: 'Semi-Auto Burst', rollTotal: 94, success: false, ...base })).toBe(true);
            expect(shouldJamRoll({ action: 'Semi-Auto Burst', rollTotal: 93, success: false, ...base })).toBe(false);
        });
        it('jam on 94 for Full Auto Burst', () => {
            expect(shouldJamRoll({ action: 'Full Auto Burst', rollTotal: 94, success: false, ...base })).toBe(true);
        });
    });

    describe('Reliable weapon', () => {
        it('only jams on natural 100, regardless of action', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 96, success: false, hasReliable: true, hasUnreliable: false })).toBe(false);
            expect(shouldJamRoll({ action: 'Semi-Auto Burst', rollTotal: 94, success: false, hasReliable: true, hasUnreliable: false })).toBe(false);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 100, success: false, hasReliable: true, hasUnreliable: false })).toBe(true);
        });
    });

    describe('Unreliable weapon (#128 — RAW core.md L6369)', () => {
        const unreliable = { hasReliable: false, hasUnreliable: true };

        it('does NOT jam on rolls below 91, regardless of success/failure or action', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 30, success: true, ...unreliable })).toBe(false);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 50, success: false, ...unreliable })).toBe(false);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 90, success: false, ...unreliable })).toBe(false);
            expect(shouldJamRoll({ action: 'Full Auto Burst', rollTotal: 89, success: false, ...unreliable })).toBe(false);
        });
        it('jams on 91+ regardless of success or action', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 91, success: false, ...unreliable })).toBe(true);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 95, success: true, ...unreliable })).toBe(true);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 100, success: false, ...unreliable })).toBe(true);
            // "even if fired on Semi- or Full Auto" — Unreliable lowers the
            // normal 94+ burst floor to 91+.
            expect(shouldJamRoll({ action: 'Semi-Auto Burst', rollTotal: 91, success: false, ...unreliable })).toBe(true);
            expect(shouldJamRoll({ action: 'Full Auto Burst', rollTotal: 93, success: false, ...unreliable })).toBe(true);
        });
    });
});

describe('weaponFireBlockReason (#410/#411 firing gate)', () => {
    it('a melee weapon never blocks, whatever its jam/ammo state', () => {
        expect(weaponFireBlockReason({ isMelee: true, jammed: true, outOfAmmo: true })).toBeNull();
        expect(weaponFireBlockReason({ isMelee: true, jammed: false, outOfAmmo: false })).toBeNull();
    });
    it('a ready ranged weapon does not block', () => {
        expect(weaponFireBlockReason({ isMelee: false, jammed: false, outOfAmmo: false })).toBeNull();
    });
    it('a jammed ranged weapon blocks with "jammed"', () => {
        expect(weaponFireBlockReason({ isMelee: false, jammed: true, outOfAmmo: false })).toBe('jammed');
    });
    it('a dry ranged weapon blocks with "empty"', () => {
        expect(weaponFireBlockReason({ isMelee: false, jammed: false, outOfAmmo: true })).toBe('empty');
    });
    it('jam takes precedence over empty when both are true', () => {
        expect(weaponFireBlockReason({ isMelee: false, jammed: true, outOfAmmo: true })).toBe('jammed');
    });
});
