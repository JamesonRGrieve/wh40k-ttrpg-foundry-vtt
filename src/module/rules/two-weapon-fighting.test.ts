import { describe, expect, it } from 'vitest';
import { resolveTwoWeaponPenalties } from './two-weapon-fighting';

const set = (...t: string[]): Set<string> => new Set(t);

describe('resolveTwoWeaponPenalties', () => {
    describe('melee', () => {
        it('baseline is −20 / −20 with no talents', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set() })).toEqual({ mainPenalty: -20, offPenalty: -20 });
        });

        it('Two-Weapon Wielder (Melee) drops main-hand to 0', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Two-Weapon Wielder (Melee)') })).toEqual({ mainPenalty: 0, offPenalty: -20 });
        });

        it('Two-Weapon Master (Melee) drops both to 0 and implies Wielder', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Two-Weapon Master (Melee)') })).toEqual({ mainPenalty: 0, offPenalty: 0 });
        });

        it('Ambidextrous alone reduces off-hand penalty by 10', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Ambidextrous') })).toEqual({ mainPenalty: -20, offPenalty: -10 });
        });

        it('Wielder + Ambidextrous: main 0, off −10', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Two-Weapon Wielder (Melee)', 'Ambidextrous') })).toEqual({
                mainPenalty: 0,
                offPenalty: -10,
            });
        });

        it('Master + Ambidextrous: still capped at 0', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Two-Weapon Master (Melee)', 'Ambidextrous') })).toEqual({
                mainPenalty: 0,
                offPenalty: 0,
            });
        });

        it('ignores ranged talents when attacking with melee', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: true, talents: set('Two-Weapon Master (Ranged)') })).toEqual({ mainPenalty: -20, offPenalty: -20 });
        });
    });

    describe('ranged', () => {
        it('Wielder (Ranged) drops main-hand only', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: false, talents: set('Two-Weapon Wielder (Ranged)') })).toEqual({ mainPenalty: 0, offPenalty: -20 });
        });

        it('Master (Ranged) drops both', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: false, talents: set('Two-Weapon Master (Ranged)') })).toEqual({ mainPenalty: 0, offPenalty: 0 });
        });

        it('ignores melee talents when attacking ranged', () => {
            expect(resolveTwoWeaponPenalties({ isMelee: false, talents: set('Two-Weapon Master (Melee)') })).toEqual({ mainPenalty: -20, offPenalty: -20 });
        });

        // Errata p. 132 regression: Two-Weapon Wielder applies to ranged
        // single-shot AND single-burst (not just standard attacks). The
        // resolver doesn't distinguish modes — it returns the same penalty
        // pair regardless of which ranged action is selected — so the
        // errata's clarification holds.
        it('errata p. 132: Wielder (Ranged) returns the same pair regardless of attack mode', () => {
            const w = resolveTwoWeaponPenalties({ isMelee: false, talents: set('Two-Weapon Wielder (Ranged)') });
            expect(w).toEqual({ mainPenalty: 0, offPenalty: -20 });
            // No conditional on a "mode" parameter — the resolver doesn't
            // accept one, which is consistent with the errata's "applies to
            // single shot or single burst" wording.
        });
    });
});
