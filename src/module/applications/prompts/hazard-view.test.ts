import { describe, expect, it } from 'vitest';
import { buildHazardSubjectView, canResolveHazard, type HazardSubject, isHazardKind } from './hazard-view.ts';

const dh2: HazardSubject = { uuid: 'Actor.a', name: 'A', img: '', line: 'dh2', toughnessBonus: 4 };
const dh1: HazardSubject = { ...dh2, uuid: 'Actor.b', line: 'dh1' };
const im: HazardSubject = { ...dh2, uuid: 'Actor.c', line: 'im' };

describe('isHazardKind (#118)', () => {
    it('accepts the two hazards and nothing else', () => {
        expect(isHazardKind('falling')).toBe(true);
        expect(isHazardKind('suffocation')).toBe(true);
        expect(isHazardKind('drowning')).toBe(false);
    });
});

describe('buildHazardSubjectView (#118)', () => {
    it('falling: resolves the formula against the subject’s own line', () => {
        expect(buildHazardSubjectView(dh2, { kind: 'falling', metres: 7, strenuous: false }).formula).toBe('1d10+7');
        expect(buildHazardSubjectView(dh1, { kind: 'falling', metres: 7, strenuous: false }).formula).toBe('1d10+5');
    });

    it('suffocation: carries the allotment and endgame, and no falling formula', () => {
        const view = buildHazardSubjectView(dh2, { kind: 'suffocation', metres: 7, strenuous: true });
        expect(view.formula).toBe('');
        expect(view.allotmentCount).toBe(8);
        expect(view.allotmentUnit).toBe('round');
        expect(view.endgame).toBe('diesAfterTbRounds');
        expect(view.roundsUntilDeath).toBe(4);
    });

    it('flags a strenuous request the line cannot honour only for suffocation', () => {
        expect(buildHazardSubjectView(dh1, { kind: 'suffocation', metres: 0, strenuous: true }).strenuousUnsupported).toBe(true);
        expect(buildHazardSubjectView(dh1, { kind: 'falling', metres: 3, strenuous: true }).strenuousUnsupported).toBe(false);
    });

    it('marks an unmodelled line unsupported', () => {
        const view = buildHazardSubjectView(im, { kind: 'falling', metres: 10, strenuous: false });
        expect(view.supported).toBe(false);
        expect(view.formula).toBe('');
        expect(view.endgame).toBe('');
    });
});

describe('canResolveHazard (#118)', () => {
    it('needs at least one supported subject with something to resolve', () => {
        const fall = { kind: 'falling', metres: 2, strenuous: false } as const;
        expect(canResolveHazard([], 'falling')).toBe(false);
        expect(canResolveHazard([buildHazardSubjectView(dh1, fall)], 'falling')).toBe(false);
        expect(canResolveHazard([buildHazardSubjectView(dh1, fall), buildHazardSubjectView(dh2, fall)], 'falling')).toBe(true);
        expect(canResolveHazard([buildHazardSubjectView(im, fall)], 'suffocation')).toBe(false);
        expect(canResolveHazard([buildHazardSubjectView(dh1, fall)], 'suffocation')).toBe(true);
    });
});
