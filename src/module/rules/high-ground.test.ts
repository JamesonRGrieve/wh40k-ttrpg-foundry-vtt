import { describe, expect, it } from 'vitest';
import { appliesHighGround, highGroundKey, highGroundMode } from './high-ground.ts';

/**
 * RAW Higher Ground per-line modifier (#407). Modes verified against each core
 * rulebook: five FFG lines apply +10 to melee (WS), DH1 to ranged (BS), IM none.
 */
describe('highGroundMode (#407)', () => {
    it('maps the five melee-WS lines', () => {
        for (const s of ['dh2', 'bc', 'dw', 'ow', 'rt'] as const) {
            expect(highGroundMode(s)).toBe('melee');
        }
    });

    it('maps DH1 to ranged (shooting from higher ground)', () => {
        expect(highGroundMode('dh1')).toBe('ranged');
    });

    it('maps IM to none (no such rule in the corpus)', () => {
        expect(highGroundMode('im')).toBe('none');
    });
});

describe('highGroundKey (#407)', () => {
    it('melee → higherGround, ranged → highGround, none → null', () => {
        expect(highGroundKey('melee')).toBe('higherGround');
        expect(highGroundKey('ranged')).toBe('highGround');
        expect(highGroundKey('none')).toBeNull();
    });
});

describe('appliesHighGround (#407)', () => {
    it('melee-mode line: applies to a melee attack from above, not a ranged one', () => {
        expect(appliesHighGround('melee', false, 10, 0)).toBe(true);
        expect(appliesHighGround('melee', true, 10, 0)).toBe(false);
    });

    it('ranged-mode line (DH1): applies to a ranged attack from above, not a melee one', () => {
        expect(appliesHighGround('ranged', true, 10, 0)).toBe(true);
        expect(appliesHighGround('ranged', false, 10, 0)).toBe(false);
    });

    it('never applies when the attacker is level with or below the target', () => {
        expect(appliesHighGround('melee', false, 0, 0)).toBe(false);
        expect(appliesHighGround('melee', false, -5, 0)).toBe(false);
        expect(appliesHighGround('ranged', true, 0, 5)).toBe(false);
    });

    it('never applies for a none-mode line (IM), regardless of elevation', () => {
        for (const isRanged of [true, false]) {
            expect(appliesHighGround('none', isRanged, 100, 0)).toBe(false);
        }
    });

    describe('elevation band + Levels pairing (#407)', () => {
        it('defaults to RAW — any strict elevation advantage counts', () => {
            expect(appliesHighGround('melee', false, 0.5, 0)).toBe(true);
            expect(appliesHighGround('melee', false, 0.5, 0, 0)).toBe(true);
        });

        it('a configured band ignores a crate-height advantage but keeps a real one', () => {
            expect(appliesHighGround('melee', false, 0.5, 0, 4)).toBe(false);
            expect(appliesHighGround('melee', false, 10, 0, 4)).toBe(true);
        });

        it('requires the delta to EXCEED the band, not merely equal it', () => {
            expect(appliesHighGround('melee', false, 4, 0, 4)).toBe(false);
            expect(appliesHighGround('melee', false, 4.1, 0, 4)).toBe(true);
        });

        it('falls back to RAW for a negative / non-finite band rather than widening the rule', () => {
            for (const band of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
                expect(appliesHighGround('melee', false, 1, 0, band)).toBe(true);
                expect(appliesHighGround('melee', false, 0, 0, band)).toBe(false);
            }
        });

        it('reads Levels floors with no Levels-specific API', () => {
            // Under Levels a token's elevation IS its floor's base height, so
            // comparing elevations already compares floors. Floor 2 (8) over
            // floor 1 (4) qualifies even with a 3-unit band; two tokens on the
            // same floor never do, whatever props they stand on.
            expect(appliesHighGround('melee', false, 8, 4, 3)).toBe(true);
            expect(appliesHighGround('melee', false, 4, 4, 3)).toBe(false);
            expect(appliesHighGround('melee', false, 4.5, 4, 3)).toBe(false);
        });

        it('refuses to decide from unusable elevations', () => {
            expect(appliesHighGround('melee', false, Number.NaN, 0)).toBe(false);
            expect(appliesHighGround('melee', false, 10, Number.POSITIVE_INFINITY)).toBe(false);
        });
    });
});
