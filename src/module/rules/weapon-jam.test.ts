import { describe, expect, it } from 'vitest';

import { getJamFloor, shouldJamRoll } from './weapon-jam';

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

    describe('Unreliable weapon', () => {
        it('jams on any failed roll', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 50, success: false, hasReliable: false, hasUnreliable: true })).toBe(true);
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 95, success: false, hasReliable: false, hasUnreliable: true })).toBe(true);
        });
        it('does NOT jam on a successful low roll', () => {
            expect(shouldJamRoll({ action: 'Standard Attack', rollTotal: 30, success: true, hasReliable: false, hasUnreliable: true })).toBe(false);
        });
    });
});
