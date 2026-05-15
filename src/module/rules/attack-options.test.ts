import { describe, expect, it } from 'vitest';
import { aggregateSituationalDamageEffects, getSituationalModifiers, MELEE_SITUATIONAL_MODIFIERS, RANGED_SITUATIONAL_MODIFIERS } from './attack-options';

describe('attack-options situational modifiers', () => {
    describe('ranged set', () => {
        it('includes Cover at four AP tiers with no to-hit penalty', () => {
            const cover = RANGED_SITUATIONAL_MODIFIERS.filter((m) => m.key.startsWith('cover'));
            expect(cover.map((m) => m.key)).toEqual(['coverLight', 'coverMedium', 'coverHeavy', 'coverSuperior']);
            for (const c of cover) {
                expect(c.modifier).toBe(0);
                expect(c.damageEffect?.coverAP).toBeGreaterThan(0);
            }
            expect(cover.map((c) => c.damageEffect?.coverAP)).toEqual([4, 6, 8, 16]);
        });

        it('includes three Fog/Smoke tiers at −10/−20/−30', () => {
            const fog = RANGED_SITUATIONAL_MODIFIERS.filter((m) => m.key.startsWith('fog'));
            expect(fog.map((m) => m.modifier)).toEqual([-10, -20, -30]);
            for (const f of fog) {
                expect(f.damageEffect).toBeUndefined();
            }
        });

        it('includes Helpless Target at +30 (ranged)', () => {
            const helpless = RANGED_SITUATIONAL_MODIFIERS.find((m) => m.key === 'helplessTarget');
            expect(helpless).toBeDefined();
            expect(helpless?.modifier).toBe(30);
            // RAW: ranged helpless does not force head; melee does.
            expect(helpless?.damageEffect).toBeUndefined();
        });
    });

    describe('melee set', () => {
        it('includes Helpless Target at +30 with forceLocation: Head', () => {
            const helpless = MELEE_SITUATIONAL_MODIFIERS.find((m) => m.key === 'helplessTarget');
            expect(helpless).toBeDefined();
            expect(helpless?.modifier).toBe(30);
            expect(helpless?.damageEffect?.forceLocation).toBe('Head');
        });

        it('includes Higher Ground at +10', () => {
            const hg = MELEE_SITUATIONAL_MODIFIERS.find((m) => m.key === 'higherGround');
            expect(hg).toBeDefined();
            expect(hg?.modifier).toBe(10);
        });
    });

    describe('aggregateSituationalDamageEffects', () => {
        it('sums cover AP across multiple active cover toggles', () => {
            const effect = aggregateSituationalDamageEffects(['coverLight', 'coverMedium'], true);
            expect(effect.coverAP).toBe(4 + 6);
            expect(effect.forceLocation).toBeUndefined();
        });

        it('returns empty object when no effects are active', () => {
            const effect = aggregateSituationalDamageEffects(['prone'], true);
            expect(effect.coverAP).toBeUndefined();
            expect(effect.forceLocation).toBeUndefined();
        });

        it('captures forceLocation from melee helpless', () => {
            const effect = aggregateSituationalDamageEffects(['helplessTarget'], false);
            expect(effect.forceLocation).toBe('Head');
        });

        it('returns no cover AP for ranged helpless (which only modifies to-hit)', () => {
            const effect = aggregateSituationalDamageEffects(['helplessTarget'], true);
            expect(effect.coverAP).toBeUndefined();
            expect(effect.forceLocation).toBeUndefined();
        });
    });

    describe('getSituationalModifiers', () => {
        it('returns the ranged set for isRanged=true', () => {
            expect(getSituationalModifiers(true)).toBe(RANGED_SITUATIONAL_MODIFIERS);
        });
        it('returns the melee set for isRanged=false', () => {
            expect(getSituationalModifiers(false)).toBe(MELEE_SITUATIONAL_MODIFIERS);
        });
    });
});
