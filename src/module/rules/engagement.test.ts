import { describe, expect, it } from 'vitest';
import {
    type EngagementToken,
    engaged,
    engagedFoes,
    gangUp,
    isDefenceless,
    type MeleeEngagementRules,
    outnumberingTraitsOf,
    rangedAttackWhileEngaged,
    STANDARD_MELEE_ENGAGEMENT,
    shootingIntoMelee,
    UNTRACKED_MELEE_ENGAGEMENT,
} from './engagement.ts';

const G = 100;
/** A one-square token at grid cell (col, row). */
const at = (id: string, col: number, row: number, disposition: number, extra: Partial<EngagementToken> = {}): EngagementToken => ({
    id,
    x: col * G,
    y: row * G,
    width: 1,
    height: 1,
    disposition,
    ...extra,
});
const DH1: MeleeEngagementRules = { ...STANDARD_MELEE_ENGAGEMENT, shootingIntoMeleeWaivedByDefenceless: false };
const DW: MeleeEngagementRules = { ...STANDARD_MELEE_ENGAGEMENT, rangedWhileEngaged: 'none' };

describe('engaged', () => {
    it('adjacent foes are engaged, diagonals included', () => {
        expect(engaged(at('a', 0, 0, 1), at('b', 1, 1, -1), G)).toBe(true);
    });
    it('a gap of one square is not engaged', () => {
        expect(engaged(at('a', 0, 0, 1), at('b', 2, 0, -1), G)).toBe(false);
    });
    it('allies and bystanders are never engaged', () => {
        expect(engaged(at('a', 0, 0, 1), at('b', 1, 0, 1), G)).toBe(false);
        expect(engaged(at('a', 0, 0, 1), at('b', 1, 0, 0), G)).toBe(false);
    });
    it('a token under a square, centred in it, counts its own square', () => {
        const small: EngagementToken = { id: 's', x: 112.5, y: 12.5, width: 0.75, height: 0.75, disposition: -1 };
        expect(engaged(at('a', 0, 0, 1), small, G)).toBe(true);
        expect(engaged(at('a', 3, 0, 1), small, G)).toBe(false);
    });
    it('lists every foe a token is engaged with', () => {
        const pc = at('pc', 1, 1, 1);
        const tokens = [pc, at('o1', 0, 0, -1), at('o2', 2, 2, -1), at('far', 5, 5, -1), at('ally', 1, 0, 1)];
        expect(engagedFoes(pc, tokens, G).map((t) => t.id)).toEqual(['o1', 'o2']);
    });
});

describe('gangUp (RAW: 2:1 +10, 3:1 or more +20)', () => {
    const target = at('t', 1, 1, -1);
    it('one on one: no bonus', () => {
        const a = at('a', 0, 1, 1);
        expect(gangUp(a, target, [a, target], G, STANDARD_MELEE_ENGAGEMENT)).toMatchObject({ attackers: 1, defenders: 1, bonus: 0 });
    });
    it('two on one: +10', () => {
        const a = at('a', 0, 1, 1);
        expect(gangUp(a, target, [a, at('b', 2, 1, 1), target], G, STANDARD_MELEE_ENGAGEMENT).bonus).toBe(10);
    });
    it('three on one: +20, and four on one stays +20 (no +30)', () => {
        const a = at('a', 0, 1, 1);
        const three = [a, at('b', 2, 1, 1), at('c', 1, 0, 1), target];
        expect(gangUp(a, target, three, G, STANDARD_MELEE_ENGAGEMENT).bonus).toBe(20);
        expect(gangUp(a, target, [...three, at('d', 1, 2, 1)], G, STANDARD_MELEE_ENGAGEMENT).bonus).toBe(20);
    });
    it("counts the target's allies engaged with the attackers: three on two is not two to one", () => {
        const a = at('a', 0, 1, 1);
        const tokens = [a, at('b', 2, 1, 1), at('c', 1, 0, 1), target, at('t2', 0, 2, -1)];
        expect(gangUp(a, target, tokens, G, STANDARD_MELEE_ENGAGEMENT)).toMatchObject({ attackers: 3, defenders: 2, bonus: 0 });
    });
    it('needs the attacker engaged with the target', () => {
        const a = at('a', 4, 4, 1);
        expect(gangUp(a, target, [a, at('b', 2, 1, 1), at('c', 0, 1, 1), target], G, STANDARD_MELEE_ENGAGEMENT).bonus).toBe(0);
    });
    it('a line without Ganging Up gives nothing', () => {
        const a = at('a', 0, 1, 1);
        expect(gangUp(a, target, [a, at('b', 2, 1, 1), target], G, UNTRACKED_MELEE_ENGAGEMENT).bonus).toBe(0);
    });
    it("Combat Master on the target denies the bonus and the attackers' talents", () => {
        const a = at('a', 0, 1, 1, { outnumbering: { denies: false, bonus: 10, sharedBonus: 10 } });
        const master = at('t', 1, 1, -1, { outnumbering: { denies: true, bonus: 0, sharedBonus: 0 } });
        expect(gangUp(a, master, [a, at('b', 2, 1, 1), master], G, STANDARD_MELEE_ENGAGEMENT)).toMatchObject({ bonus: 0, talentBonus: 0, denied: true });
    });
    it('Double Team adds +10 while ganging up, +20 when the partner has it too, and nothing one on one', () => {
        const dt = { denies: false, bonus: 10, sharedBonus: 10 };
        const a = at('a', 0, 1, 1, { outnumbering: dt });
        expect(gangUp(a, target, [a, at('b', 2, 1, 1), target], G, STANDARD_MELEE_ENGAGEMENT).talentBonus).toBe(10);
        expect(gangUp(a, target, [a, at('b', 2, 1, 1, { outnumbering: dt }), target], G, STANDARD_MELEE_ENGAGEMENT).talentBonus).toBe(20);
        expect(gangUp(a, target, [a, target], G, STANDARD_MELEE_ENGAGEMENT).talentBonus).toBe(0);
    });
});

describe('shootingIntoMelee', () => {
    const shooter = at('s', 0, 0, 1);
    it('−20 at a target engaged with someone else', () => {
        const target = at('t', 5, 5, -1);
        expect(shootingIntoMelee(shooter, target, [shooter, target, at('ally', 5, 4, 1)], G, STANDARD_MELEE_ENGAGEMENT)).toBe(-20);
    });
    it('nothing at a target engaged with no one, or only with the shooter', () => {
        const target = at('t', 5, 5, -1);
        expect(shootingIntoMelee(shooter, target, [shooter, target], G, STANDARD_MELEE_ENGAGEMENT)).toBe(0);
        const adjacent = at('t', 1, 0, -1);
        expect(shootingIntoMelee(shooter, adjacent, [shooter, adjacent], G, STANDARD_MELEE_ENGAGEMENT)).toBe(0);
    });
    it('waived when anyone in that melee is Stunned, Helpless or Unaware, except in DH1', () => {
        const target = at('t', 5, 5, -1, { defenceless: true });
        const tokens = [shooter, target, at('ally', 5, 4, 1)];
        expect(shootingIntoMelee(shooter, target, tokens, G, STANDARD_MELEE_ENGAGEMENT)).toBe(0);
        expect(shootingIntoMelee(shooter, target, tokens, G, DH1)).toBe(-20);
    });
});

describe('rangedAttackWhileEngaged', () => {
    it('an engaged attacker may fire a pistol only; Deathwatch, nothing', () => {
        expect(rangedAttackWhileEngaged(true, 'pistol', STANDARD_MELEE_ENGAGEMENT)).toBeNull();
        expect(rangedAttackWhileEngaged(true, 'basic', STANDARD_MELEE_ENGAGEMENT)).toBe('pistol-only');
        expect(rangedAttackWhileEngaged(true, 'pistol', DW)).toBe('melee-only');
    });
    it('an attacker not engaged fires anything', () => {
        expect(rangedAttackWhileEngaged(false, 'heavy', DW)).toBeNull();
    });
});

describe('outnumberingTraitsOf and isDefenceless', () => {
    it('sums the talents: any one denies; bonuses add; items without the field are skipped', () => {
        expect(
            outnumberingTraitsOf([
                { system: { modifiers: { outnumbering: { denies: false, bonus: 10, sharedBonus: 10 } } } },
                { system: { modifiers: { outnumbering: { denies: true } } } },
                { system: {} },
            ]),
        ).toEqual({ denies: true, bonus: 10, sharedBonus: 10 });
    });
    it('Stunned, Helpless and Unconscious are defenceless; Prone is not', () => {
        expect(isDefenceless(['prone', 'stunned'])).toBe(true);
        expect(isDefenceless(new Set(['unconscious']))).toBe(true);
        expect(isDefenceless(['prone'])).toBe(false);
    });
});
