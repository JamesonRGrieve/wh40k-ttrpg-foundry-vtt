import { describe, expect, it } from 'vitest';
import {
    aggregateSituationalDamageEffects,
    getSituationalModifiers,
    MELEE_ATTACK_MODES,
    MELEE_SITUATIONAL_MODIFIERS,
    MELEE_SPECIAL_OPTIONS,
    RANGED_ATTACK_MODES,
    RANGED_SITUATIONAL_MODIFIERS,
} from './attack-options';
import { allCombatActions } from './combat-actions';

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

describe('ranged Rate-of-Fire to-hit modifiers (#231)', () => {
    const findRanged = (key: string): (typeof RANGED_ATTACK_MODES)[number] | undefined => RANGED_ATTACK_MODES.find((m) => m.key === key);

    it('uses RAW values: single shot +0, semi-auto +0, full-auto -10', () => {
        // Standard Attack has no inherent to-hit bonus in DH2e RAW (#383 — the
        // #231 +10 single-shot bonus was incorrect); semi +0, full -10 stand.
        expect(findRanged('standard')?.modifier).toBe(0);
        expect(findRanged('semiAuto')?.modifier).toBe(0);
        expect(findRanged('fullAuto')?.modifier).toBe(-10);
    });

    it('does not regress to the reported +10 semi / +20 full bonuses', () => {
        expect(findRanged('semiAuto')?.modifier).not.toBe(10);
        expect(findRanged('fullAuto')?.modifier).not.toBe(20);
    });

    it('tooltips agree with the numeric modifier (no stale +10/+20 text)', () => {
        expect(findRanged('standard')?.tooltip).toContain('+0 to BS');
        expect(findRanged('semiAuto')?.tooltip).toContain('+0 BS');
        expect(findRanged('fullAuto')?.tooltip).toContain('-10 BS');
    });
});

describe('attack-mode ↔ combat-action modifier consistency (single source, #231)', () => {
    // The dialog DISPLAYS the attack-mode modifier; the roll APPLIES the linked
    // combat action's modifier (calculateCombatActionModifier reads
    // allCombatActions()[].attack.modifier by action name). If they drift the UI
    // shows one number while the roll uses another — exactly how Full-Auto came
    // to read +20 while applying 0. This locks them together.
    const actionModifier = (name: string): number => {
        const action = allCombatActions().find((a) => a.name === name);
        return action?.attack?.modifier ?? 0;
    };

    const allModes = [...RANGED_ATTACK_MODES, ...MELEE_ATTACK_MODES, ...MELEE_SPECIAL_OPTIONS];

    it.each(allModes)('mode "$key" displays the same modifier its action ($actionName) applies', (mode) => {
        expect(mode.modifier, `${mode.key} → ${mode.actionName}`).toBe(actionModifier(mode.actionName));
    });
});
