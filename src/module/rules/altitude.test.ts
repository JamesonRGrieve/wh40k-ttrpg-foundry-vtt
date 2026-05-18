import { describe, expect, it } from 'vitest';

import { ALTITUDE_PROFILES, canChangeAltitude } from './altitude.ts';

describe('flyer altitude rules (#99)', () => {
    it('defines escalating ranged-attack penalties per tier', () => {
        expect(ALTITUDE_PROFILES.ground.rangedAttackModifier).toBe(0);
        expect(ALTITUDE_PROFILES.low.rangedAttackModifier).toBe(-10);
        expect(ALTITUDE_PROFILES.high.rangedAttackModifier).toBe(-30);
        expect(ALTITUDE_PROFILES.orbital.rangedAttackModifier).toBe(-60);
    });

    it('only High altitude enforces a minimum movement', () => {
        expect(ALTITUDE_PROFILES.high.minimumMovementMetres).toBe(50);
        expect(ALTITUDE_PROFILES.ground.minimumMovementMetres).toBe(0);
        expect(ALTITUDE_PROFILES.low.minimumMovementMetres).toBe(0);
        expect(ALTITUDE_PROFILES.orbital.minimumMovementMetres).toBe(0);
    });

    describe('canChangeAltitude', () => {
        it('allows staying at the same altitude', () => {
            expect(canChangeAltitude('low', 'low')).toBe(true);
        });

        it('allows transitions between adjacent tiers (both directions)', () => {
            expect(canChangeAltitude('ground', 'low')).toBe(true);
            expect(canChangeAltitude('low', 'ground')).toBe(true);
            expect(canChangeAltitude('high', 'orbital')).toBe(true);
            expect(canChangeAltitude('orbital', 'high')).toBe(true);
        });

        it('forbids skipping a tier in one turn', () => {
            expect(canChangeAltitude('ground', 'high')).toBe(false);
            expect(canChangeAltitude('low', 'orbital')).toBe(false);
            expect(canChangeAltitude('ground', 'orbital')).toBe(false);
        });
    });
});
