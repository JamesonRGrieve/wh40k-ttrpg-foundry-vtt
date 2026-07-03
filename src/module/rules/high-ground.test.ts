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
});
