import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComradeRecord } from '../rules/ow-comrade.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';

/**
 * A PC's Fear or Pinning test carries its Comrade (#152; OW Core p. 271): the card
 * states the Comrade's result, and a Comrade that fails with its PC is marked
 * fleeing or pinned on the PC. The PC's own test (the skill pipeline's text) is
 * stubbed; what the mirror adds is asserted.
 */

installApplicationV2Stub();
const mirror = await import('./action-data.ts');
const { SimpleSkillData } = mirror;

const COMRADE: ComradeRecord = {
    name: 'Comrade Jaeger',
    state: 'unharmed',
    distanceM: 9,
    hasVisualLine: false,
    fleeing: false,
    pinned: false,
    fearImmune: false,
    pinningImmune: false,
    turn: { combatId: '', round: 0, halvesSpent: 0 },
    mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
};

describe('comradeMirrorTestFor', () => {
    it('an Only War PC with a Comrade gets the mirroring test; anyone else a plain one', () => {
        expect(mirror.comradeMirrorTestFor({ system: { gameSystem: 'ow', comrade: COMRADE } }, 'fear')).toBeInstanceOf(mirror.ComradeMirrorTestData);
        expect(mirror.comradeMirrorTestFor({ system: { gameSystem: 'dh2', comrade: COMRADE } }, 'fear')).toBeUndefined();
        expect(mirror.comradeMirrorTestFor({ system: { gameSystem: 'ow' } }, 'pinning')).toBeUndefined();
    });
});

describe('ComradeMirrorTestData', () => {
    const update = vi.fn(async () => Promise.resolve());

    beforeEach(() => {
        update.mockClear();
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
        vi.spyOn(SimpleSkillData.prototype, 'descriptionText').mockImplementation(async () => Promise.resolve());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** Resolve the mirrored test with the PC passing or failing, and return the effects it added. */
    async function resolve(test: 'fear' | 'pinning', pcPassed: boolean, comrade: ComradeRecord = COMRADE): Promise<Array<{ name: string; effect: string }>> {
        const data = new mirror.ComradeMirrorTestData(test, comrade);
        data.rollData.success = pcPassed;
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the rolling PC (a Foundry Actor cannot be built under happy-dom)
        data.rollData.sourceActor = { update } as unknown as typeof data.rollData.sourceActor;
        await data.descriptionText();
        return data.effectOutput;
    }

    it('the PC fails Fear: the Comrade flees, out of Cohesion as much as in it', async () => {
        const effects = await resolve('fear', false);
        expect(effects).toEqual([{ name: 'Comrade Jaeger', effect: 'WH40K.OW.Comrade.Mirror.FearFails' }]);
        expect(update).toHaveBeenCalledExactlyOnceWith({ 'system.comrade.fleeing': true });
    });

    it('the PC fails Pinning: the Comrade is pinned', async () => {
        await resolve('pinning', false);
        expect(update).toHaveBeenCalledExactlyOnceWith({ 'system.comrade.pinned': true });
    });

    it('the PC passes: the Comrade passes too, and nothing is marked', async () => {
        const effects = await resolve('fear', true);
        expect(effects.at(0)?.effect).toBe('WH40K.OW.Comrade.Mirror.FearPasses');
        expect(update).not.toHaveBeenCalled();
    });

    it('an immune Comrade does not fail with its PC', async () => {
        const effects = await resolve('pinning', false, { ...COMRADE, pinningImmune: true });
        expect(effects.at(0)?.effect).toBe('WH40K.OW.Comrade.Mirror.PinningImmune');
        expect(update).not.toHaveBeenCalled();
    });

    it('a dead Comrade adds nothing', async () => {
        expect(await resolve('fear', false, { ...COMRADE, state: 'dead' })).toEqual([]);
        expect(update).not.toHaveBeenCalled();
    });
});
