import { describe, expect, it } from 'vitest';
import { asBaseActor } from '../../testing/actor-stub.ts';
import { OWSystemConfig } from './ow-config.ts';

/**
 * Only War psyker gating (#424). OW's unlock is the 'Sanctioned Psyker'
 * speciality; `isPsyker` delegates to the shared
 * `BaseSystemConfig.ownsOriginPathItem` helper. These pin the OW branch of the
 * de-duplicated predicate — the two-word name plus the case-insensitive match.
 */
describe('OWSystemConfig: isPsyker (shared origin-path predicate)', () => {
    const cfg = new OWSystemConfig();
    const actorWithItem = (step: string, name: string): ReturnType<typeof asBaseActor> =>
        asBaseActor({ items: [{ isOriginPath: true, system: { step }, name }] });

    it('detects the Sanctioned Psyker speciality', () => {
        expect(cfg.isPsyker(actorWithItem('speciality', 'Sanctioned Psyker'))).toBe(true);
    });

    it('is case-insensitive on the item name', () => {
        expect(cfg.isPsyker(actorWithItem('speciality', 'sanctioned psyker'))).toBe(true);
    });

    it('rejects a Sanctioned Psyker item on the wrong step', () => {
        expect(cfg.isPsyker(actorWithItem('regiment', 'Sanctioned Psyker'))).toBe(false);
    });

    it('rejects a non-Psyker speciality', () => {
        expect(cfg.isPsyker(actorWithItem('speciality', 'Weapon Specialist'))).toBe(false);
    });

    it('ignores non-origin-path items with a matching name', () => {
        expect(cfg.isPsyker(asBaseActor({ items: [{ isOriginPath: false, system: { step: 'speciality' }, name: 'Sanctioned Psyker' }] }))).toBe(false);
    });

    it('returns false with no items', () => {
        expect(cfg.isPsyker(asBaseActor({ items: [] }))).toBe(false);
    });
});
