import { describe, expect, it } from 'vitest';
import {
    clampDisposition,
    DISPOSITION_LABELS,
    DISPOSITION_RANGE,
    getDispositionModifier,
    getInteractionCap,
    labelForDisposition,
    resolveInteractionDispositionGain,
} from './disposition';

describe('clampDisposition / DISPOSITION_RANGE (#376 — single-sourced clamp)', () => {
    it('declares the −3..+3 inclusive bounds', () => {
        expect(DISPOSITION_RANGE.min).toBe(-3);
        expect(DISPOSITION_RANGE.max).toBe(3);
    });
    it('passes through in-range values unchanged', () => {
        expect(clampDisposition(-3)).toBe(-3);
        expect(clampDisposition(0)).toBe(0);
        expect(clampDisposition(3)).toBe(3);
    });
    it('clamps out-of-range values to the extremes', () => {
        expect(clampDisposition(99)).toBe(3);
        expect(clampDisposition(-99)).toBe(-3);
    });
    it('truncates fractions toward zero', () => {
        expect(clampDisposition(1.9)).toBe(1);
        expect(clampDisposition(-1.9)).toBe(-1);
    });
});

describe('labelForDisposition', () => {
    it('maps -3 to Hostile, 0 to Neutral, +3 to Helpful', () => {
        expect(labelForDisposition(-3)).toBe('Hostile');
        expect(labelForDisposition(0)).toBe('Neutral');
        expect(labelForDisposition(3)).toBe('Helpful');
    });
    it('clamps out-of-range values to the extremes', () => {
        expect(labelForDisposition(-99)).toBe('Hostile');
        expect(labelForDisposition(99)).toBe('Helpful');
    });
    it('label list has the canonical 7 entries', () => {
        expect(DISPOSITION_LABELS).toHaveLength(7);
    });
});

describe('getDispositionModifier', () => {
    it('Charm gets +10 per disposition step up', () => {
        expect(getDispositionModifier(2, 'charm')).toBe(20);
        expect(getDispositionModifier(-1, 'charm')).toBe(-10);
    });
    it('Intimidate inverts (friendly NPCs resist intimidation)', () => {
        expect(getDispositionModifier(2, 'intimidate')).toBe(-20);
        expect(getDispositionModifier(-3, 'intimidate')).toBe(30);
    });
    it('clamps the disposition input to −3..+3', () => {
        expect(getDispositionModifier(99, 'charm')).toBe(30);
        expect(getDispositionModifier(-99, 'charm')).toBe(-30);
    });
});

describe('getInteractionCap', () => {
    it('returns the Fellowship bonus as the cap', () => {
        expect(getInteractionCap(4)).toBe(4);
        expect(getInteractionCap(0)).toBe(0);
    });
    it('clamps negative bonuses to zero (malformed input)', () => {
        expect(getInteractionCap(-3)).toBe(0);
    });
});

describe('resolveInteractionDispositionGain', () => {
    it('passes the raw gain through below the Fellowship-bonus cap', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 4, interactionsSoFar: 1, rawGain: 1 });
        expect(r).toEqual({ gain: 1, atCap: false, remainingInteractions: 3 });
    });

    it('reports remainingInteractions = cap − used before incrementing the tally', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 5, interactionsSoFar: 0, rawGain: 2 });
        expect(r.gain).toBe(2);
        expect(r.remainingInteractions).toBe(5);
    });

    it('suppresses the gain and flags atCap once interactionsSoFar reaches the cap', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 3, interactionsSoFar: 3, rawGain: 1 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });

    it('treats over-cap tallies the same as exactly at-cap (no negative remaining)', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 2, interactionsSoFar: 7, rawGain: 3 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });

    it('zero Fellowship bonus means no interaction-based disposition gain is ever earned', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 0, interactionsSoFar: 0, rawGain: 1 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });
});
