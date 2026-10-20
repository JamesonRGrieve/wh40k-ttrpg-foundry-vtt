import { describe, expect, it } from 'vitest';
import { asBaseActor } from '../../testing/actor-stub.ts';
import { OWSystemConfig } from './ow-config.ts';

/**
 * Only War psyker gating (#424, #681). A character is a psyker when it owns an
 * origin-path item whose compendium document carries `grantsPsychicPowers`
 * (OW's Sanctioned Psyker speciality, OW core p. 94). The predicate reads the
 * flag, never the name, so a renamed speciality still unlocks and a namesake
 * without the flag does not.
 */
describe('OWSystemConfig: isPsyker (origin flagged grantsPsychicPowers)', () => {
    const cfg = new OWSystemConfig();
    const actorWithOrigin = (name: string, grantsPsychicPowers: boolean, isOriginPath = true): ReturnType<typeof asBaseActor> =>
        asBaseActor({ items: [{ isOriginPath, system: { step: 'speciality', grantsPsychicPowers }, name }] });

    it('unlocks for the flagged Sanctioned Psyker speciality', () => {
        expect(cfg.isPsyker(actorWithOrigin('Sanctioned Psyker', true))).toBe(true);
    });

    it('still unlocks when the flagged speciality is renamed', () => {
        expect(cfg.isPsyker(actorWithOrigin('Battle Psyker (homebrew rename)', true))).toBe(true);
    });

    it('does not unlock for a Sanctioned Psyker namesake without the flag', () => {
        expect(cfg.isPsyker(actorWithOrigin('Sanctioned Psyker', false))).toBe(false);
    });

    it('ignores a flagged item that is not an origin-path item', () => {
        expect(cfg.isPsyker(actorWithOrigin('Sanctioned Psyker', true, false))).toBe(false);
    });

    it('returns false with no items', () => {
        expect(cfg.isPsyker(asBaseActor({ items: [] }))).toBe(false);
    });

    it('keeps only the step for the locked banner', () => {
        expect(cfg.psykerUnlock).toEqual({ step: 'speciality' });
    });
});
