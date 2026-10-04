import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLangStub } from '../testing/lang-stub.ts';
import { corruptionDegree, corruptionDegreeClass, insanityDegree, insanityDegreeClass } from './degree-ladders.ts';

/**
 * The Corruption / Insanity degree names resolve through the real English
 * langpack (`WH40K.Status.<Track>.Degree.<Tier>.Label`), while the CSS class
 * ladder stays code-resident.
 */
describe('degree ladders', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: buildLangStub() });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each([
        [0, 'PURE'],
        [1, 'TAINTED'],
        [30, 'TAINTED'],
        [31, 'SOILED'],
        [60, 'SOILED'],
        [61, 'DEBASED'],
        [90, 'DEBASED'],
        [91, 'PROFANE'],
        [99, 'PROFANE'],
        [100, 'DAMNED'],
    ])('corruption %i is %s', (points, label) => {
        expect(corruptionDegree(points)).toBe(label);
    });

    it.each([
        [0, 'STABLE'],
        [9, 'STABLE'],
        [10, 'UNSETTLED'],
        [39, 'UNSETTLED'],
        [40, 'DISTURBED'],
        [59, 'DISTURBED'],
        [60, 'UNHINGED'],
        [79, 'UNHINGED'],
        [80, 'DERANGED'],
        [99, 'DERANGED'],
        [100, 'TERMINALLY INSANE'],
    ])('insanity %i is %s', (points, label) => {
        expect(insanityDegree(points)).toBe(label);
    });

    it('coerces non-numeric template input to zero', () => {
        expect(corruptionDegree(undefined)).toBe('PURE');
        expect(insanityDegree('not a number')).toBe('STABLE');
    });

    it('leaves the CSS class ladders untouched', () => {
        expect(corruptionDegreeClass(35)).toBe('wh40k-degree-soiled');
        expect(insanityDegreeClass(100)).toBe('wh40k-degree-terminally');
    });
});
