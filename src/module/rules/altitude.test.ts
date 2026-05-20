import { describe, expect, it } from 'vitest';

import { ALTITUDE_PROFILES, canChangeAltitude, FLYER_AIRBORNE_FIRE_PENALTY, resolveFlyerFireModifier } from './altitude.ts';

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

describe('flyer-fire penalty composer (#133)', () => {
    it('exposes the Without flat airborne-flyer penalty as -20', () => {
        expect(FLYER_AIRBORNE_FIRE_PENALTY).toBe(-20);
    });

    it('reuses the per-altitude rangedAttackModifier table, not a duplicate', () => {
        // Ground: no per-altitude modifier and not airborne → no penalty at all.
        const ground = resolveFlyerFireModifier('ground', 'ground');
        expect(ground.altitudeModifier).toBe(ALTITUDE_PROFILES.ground.rangedAttackModifier);
        expect(ground.airbornePenalty).toBe(0);
        expect(ground.modifier).toBe(0);
        expect(ground.untargetable).toBe(false);
    });

    it('stacks the flat -20 airborne penalty on top of the Low-altitude modifier', () => {
        const low = resolveFlyerFireModifier('low', 'ground');
        expect(low.altitudeModifier).toBe(ALTITUDE_PROFILES.low.rangedAttackModifier); // -10
        expect(low.airbornePenalty).toBe(FLYER_AIRBORNE_FIRE_PENALTY); // -20
        expect(low.modifier).toBe(ALTITUDE_PROFILES.low.rangedAttackModifier + FLYER_AIRBORNE_FIRE_PENALTY); // -30
        expect(low.untargetable).toBe(false);
    });

    it('marks High and Orbital flyers untargetable from the ground', () => {
        expect(resolveFlyerFireModifier('high', 'ground').untargetable).toBe(true);
        expect(resolveFlyerFireModifier('orbital', 'ground').untargetable).toBe(true);
    });

    it('still allows an airborne shooter to target a High/Orbital flyer (penalised)', () => {
        const high = resolveFlyerFireModifier('high', 'airborne');
        expect(high.untargetable).toBe(false);
        expect(high.modifier).toBe(ALTITUDE_PROFILES.high.rangedAttackModifier + FLYER_AIRBORNE_FIRE_PENALTY);
    });

    it('defaults the shooter to the ground when not specified', () => {
        expect(resolveFlyerFireModifier('high').untargetable).toBe(true);
    });
});
