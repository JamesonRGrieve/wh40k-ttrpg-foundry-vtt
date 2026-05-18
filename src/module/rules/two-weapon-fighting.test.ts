import { describe, expect, it } from 'vitest';
import { isTwoWeaponRefocusMode, resolveTwoWeaponPenalties, resolveTwoWeaponRefocus } from './two-weapon-fighting';

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

// ──────────────────────────────────────────────
// Errata p. 132 — Half-Action refocus (#147)
// ──────────────────────────────────────────────
//
// The acceptance criteria require asserting on the *standard-attack
// action invocations*, not just the modifier total: the ranged dual
// attack must fire a Half-Action Standard Attack ×2 (single shot), not
// a Full-Action lump or Semi-Auto-Burst ×2, and the follow-up must
// follow the same restrictions as a Free Action.

describe('isTwoWeaponRefocusMode — errata-legal openers', () => {
    it('accepts Standard / Swift / Lightning in melee, rejects ranged-only modes', () => {
        expect(isTwoWeaponRefocusMode('Standard Attack', true)).toBe(true);
        expect(isTwoWeaponRefocusMode('Swift Attack', true)).toBe(true);
        expect(isTwoWeaponRefocusMode('Lightning Attack', true)).toBe(true);
        expect(isTwoWeaponRefocusMode('Semi-Auto Burst', true)).toBe(false);
        expect(isTwoWeaponRefocusMode('Full Auto Burst', true)).toBe(false);
    });

    it('accepts single-shot / semi-auto / full-auto in ranged, rejects melee-only modes', () => {
        expect(isTwoWeaponRefocusMode('Standard Attack', false)).toBe(true);
        expect(isTwoWeaponRefocusMode('Semi-Auto Burst', false)).toBe(true);
        expect(isTwoWeaponRefocusMode('Full Auto Burst', false)).toBe(true);
        expect(isTwoWeaponRefocusMode('Swift Attack', false)).toBe(false);
        expect(isTwoWeaponRefocusMode('Lightning Attack', false)).toBe(false);
    });
});

describe('resolveTwoWeaponRefocus (#147 — errata p. 132 ranged Half-Action refocus)', () => {
    it('ranged Wielder + single shot fires a Half-Action Standard Attack ×2 (NOT a Full-Action lump or Semi-Auto ×2)', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Wielder (Ranged)'),
        });

        expect(plan.granted).toBe(true);
        expect(plan.attacks).toHaveLength(2);

        // Assert on the action *invocations*, per the acceptance criteria.
        const [main, off] = plan.attacks;
        expect(main).toEqual({ hand: 'main', actionName: 'Standard Attack', actionCost: 'Half', modifier: 0 });
        expect(off).toEqual({ hand: 'off', actionName: 'Standard Attack', actionCost: 'Free', modifier: -20 });

        // Both attacks are Standard Attacks — never Semi-Auto-Burst ×2 and
        // never a single Full-Action action. The action-cost union itself
        // is statically 'Half' | 'Free' (no 'Full' member), so a
        // structural "is it a Full-Action lump?" check is the action-name
        // list having a single Full-cost entry — which it never does here:
        // two entries, both Standard Attack, costs Half then Free.
        expect(plan.attacks.map((a) => a.actionName)).toEqual(['Standard Attack', 'Standard Attack']);
        expect(plan.attacks.map((a) => a.actionCost)).toEqual(['Half', 'Free']);
    });

    it('off-hand follows the SAME restrictions (semi-auto opener → semi-auto follow-up) as a Free Action', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Semi-Auto Burst',
            talents: set('Two-Weapon Wielder (Ranged)'),
        });

        expect(plan.granted).toBe(true);
        expect(plan.attacks.map((a) => a.actionName)).toEqual(['Semi-Auto Burst', 'Semi-Auto Burst']);
        expect(plan.attacks[0]?.actionCost).toBe('Half');
        expect(plan.attacks[1]?.actionCost).toBe('Free');
    });

    it('modifier accumulation matches the errata: −20 each without Wielder/Master/Ambidextrous', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Wielder (Ranged)'),
        });
        // Wielder zeroes main, off stays −20.
        expect(plan.attacks[0]?.modifier).toBe(0);
        expect(plan.attacks[1]?.modifier).toBe(-20);

        const ambi = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Wielder (Ranged)', 'Ambidextrous'),
        });
        expect(ambi.attacks[0]?.modifier).toBe(0);
        expect(ambi.attacks[1]?.modifier).toBe(-10);

        const master = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Full Auto Burst',
            talents: set('Two-Weapon Master (Ranged)'),
        });
        expect(master.attacks[0]?.modifier).toBe(0);
        expect(master.attacks[1]?.modifier).toBe(0);
    });

    it('without the matching-flavour talent: only the lone Half-Action attack, no Free-Action follow-up', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set(),
        });
        expect(plan.granted).toBe(false);
        expect(plan.attacks).toEqual([{ hand: 'main', actionName: 'Standard Attack', actionCost: 'Half', modifier: -20 }]);
    });

    it('melee-flavour talent does not grant the ranged follow-up (and vice versa)', () => {
        const rangedWithMeleeTalent = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Wielder (Melee)'),
        });
        expect(rangedWithMeleeTalent.granted).toBe(false);
        expect(rangedWithMeleeTalent.attacks).toHaveLength(1);

        const meleeWithRangedTalent = resolveTwoWeaponRefocus({
            isMelee: true,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Wielder (Ranged)'),
        });
        expect(meleeWithRangedTalent.granted).toBe(false);
        expect(meleeWithRangedTalent.attacks).toHaveLength(1);
    });

    it('illegal opener mode for the flavour does not grant the follow-up', () => {
        // Semi-Auto Burst is not a legal melee opener.
        const plan = resolveTwoWeaponRefocus({
            isMelee: true,
            mode: 'Semi-Auto Burst',
            talents: set('Two-Weapon Wielder (Melee)'),
        });
        expect(plan.granted).toBe(false);
        expect(plan.attacks).toHaveLength(1);
    });

    it('FAQ p. 571: restrictToStandard forces the off-hand follow-up to a plain Standard Attack', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Full Auto Burst',
            talents: set('Two-Weapon Wielder (Ranged)'),
            restrictToStandard: true,
        });
        expect(plan.granted).toBe(true);
        expect(plan.attacks[0]?.actionName).toBe('Full Auto Burst');
        expect(plan.attacks[1]?.actionName).toBe('Standard Attack');
        expect(plan.attacks[1]?.actionCost).toBe('Free');
    });

    it('FAQ p. 693: an Aim bonus never carries onto the off-hand follow-up', () => {
        const plan = resolveTwoWeaponRefocus({
            isMelee: false,
            mode: 'Standard Attack',
            talents: set('Two-Weapon Master (Ranged)'),
        });
        expect(plan.aimAppliesToOffHand).toBe(false);
    });
});
