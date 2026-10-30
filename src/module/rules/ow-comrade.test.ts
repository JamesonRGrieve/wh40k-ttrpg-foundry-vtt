import { describe, expect, it } from 'vitest';
import { comradeRulesFor } from '../config/game-systems/index.ts';
import {
    applyComradeHit,
    applyComradeMentalDamage,
    buildComradePanel,
    comradeActionsLeft,
    comradeFearEndsWithCombat,
    comradeHitStrike,
    comradeMirrorsFearPinning,
    comradeMirrorWrites,
    type ComradeRecord,
    type ComradeRules,
    healComrade,
    inCohesion,
    isDoublesRoll,
    readComradeRecord,
    recoverComrade,
    replaceComrade,
    spendComradeActions,
    transfersToComrade,
    withoutOneHitOn,
} from './ow-comrade';

/** Only War's printed Comrade rules (the line config). */
function owRules(): ComradeRules {
    const rules = comradeRulesFor('ow');
    if (rules === null) throw new Error('Only War prints Comrades');
    return rules;
}
const RULES = owRules();

const ROUND = { combatId: 'c1', round: 2 };

const comrade = (over: Partial<ComradeRecord> = {}): ComradeRecord => ({
    name: 'Trooper Vask',
    state: 'unharmed',
    distanceM: 3,
    hasVisualLine: true,
    fleeing: false,
    pinned: false,
    fearImmune: false,
    pinningImmune: false,
    turn: { combatId: '', round: 0, halvesSpent: 0 },
    mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
    ...over,
});

describe('ow-comrade — the printed rules on the line config', () => {
    it('Only War: Cohesion within 5 m, two Half Actions a Turn, death at 10 Insanity or Corruption in a Round', () => {
        expect(RULES).toEqual({ cohesionRangeM: 5, actionBudget: 2, mentalDeathThreshold: 10 });
    });

    it.each(['dh1', 'dh2', 'rt', 'bc', 'dw', 'im'])('%s prints no Comrades', (line) => {
        expect(comradeRulesFor(line)).toBeNull();
    });
});

describe('ow-comrade — inCohesion', () => {
    it('is true inside the 5 m radius with no barrier, and at exactly 5 m', () => {
        expect(inCohesion({ distanceM: 4, hasVisualLine: true }, RULES)).toBe(true);
        expect(inCohesion({ distanceM: 5, hasVisualLine: true }, RULES)).toBe(true);
    });

    it('breaks past 5 m, or behind a solid barrier even at 0 m', () => {
        expect(inCohesion({ distanceM: 6, hasVisualLine: true }, RULES)).toBe(false);
        expect(inCohesion({ distanceM: 0, hasVisualLine: false }, RULES)).toBe(false);
    });

    it('reads a negative or non-finite distance as 0', () => {
        expect(inCohesion({ distanceM: -3, hasVisualLine: true }, RULES)).toBe(true);
        expect(inCohesion({ distanceM: Number.NaN, hasVisualLine: true }, RULES)).toBe(true);
    });
});

describe('ow-comrade — state-track transitions', () => {
    it('a hit moves unharmed → wounded → dead; dead stays dead', () => {
        expect(applyComradeHit('unharmed')).toEqual({ newState: 'wounded', transitioned: true });
        expect(applyComradeHit('wounded')).toEqual({ newState: 'dead', transitioned: true });
        expect(applyComradeHit('dead')).toEqual({ newState: 'dead', transitioned: false });
    });

    it('healing returns a wounded Comrade to unharmed only', () => {
        expect(healComrade('wounded')).toEqual({ newState: 'unharmed', transitioned: true });
        expect(healComrade('unharmed').transitioned).toBe(false);
        expect(healComrade('dead').transitioned).toBe(false);
    });

    it('only a dead Comrade is replaced, and only with a replacement available', () => {
        expect(replaceComrade('dead', true)).toEqual({ newState: 'unharmed', transitioned: true, replaced: true });
        expect(replaceComrade('dead', false).replaced).toBe(false);
        expect(replaceComrade('wounded', true).replaced).toBe(false);
        expect(replaceComrade('unharmed', true).replaced).toBe(false);
    });
});

describe('ow-comrade — the action budget', () => {
    it('two Half Actions a Turn; a Full Action is both', () => {
        expect(comradeActionsLeft(comrade().turn, ROUND, RULES)).toBe(2);
        const afterHalf = spendComradeActions(comrade().turn, ROUND, 1);
        expect(comradeActionsLeft(afterHalf, ROUND, RULES)).toBe(1);
        expect(comradeActionsLeft(spendComradeActions(afterHalf, ROUND, 1), ROUND, RULES)).toBe(0);
        expect(comradeActionsLeft(spendComradeActions(comrade().turn, ROUND, 2), ROUND, RULES)).toBe(0);
    });

    it('a new Round, or another combat, starts the budget again', () => {
        const spent = spendComradeActions(comrade().turn, ROUND, 2);
        expect(comradeActionsLeft(spent, { combatId: 'c1', round: 3 }, RULES)).toBe(2);
        expect(comradeActionsLeft(spent, { combatId: 'c2', round: 2 }, RULES)).toBe(2);
        expect(spendComradeActions(spent, { combatId: 'c1', round: 3 }, 1)).toEqual({ combatId: 'c1', round: 3, halvesSpent: 1 });
    });

    it('out of combat there is no Turn to spend', () => {
        expect(comradeActionsLeft(spendComradeActions(comrade().turn, ROUND, 2), null, RULES)).toBe(2);
    });
});

describe('ow-comrade — a hit on the PC strikes the Comrade', () => {
    it('doubles in Cohesion transfers; out of Cohesion it does not', () => {
        const base = { weaponBlastOrSpray: false, comradeInBlastSprayRange: false };
        expect(transfersToComrade({ ...base, pcRollDoubles: true, comradeInCohesion: true })).toEqual({ transfers: true, reason: 'doubles' });
        expect(transfersToComrade({ ...base, pcRollDoubles: true, comradeInCohesion: false })).toEqual({ transfers: false, reason: 'none' });
        expect(transfersToComrade({ ...base, pcRollDoubles: false, comradeInCohesion: true })).toEqual({ transfers: false, reason: 'none' });
    });

    it('Blast or Spray catches a Comrade in its area, Cohesion or not', () => {
        expect(transfersToComrade({ pcRollDoubles: false, comradeInCohesion: false, weaponBlastOrSpray: true, comradeInBlastSprayRange: true })).toEqual({
            transfers: true,
            reason: 'blast-spray',
        });
        expect(transfersToComrade({ pcRollDoubles: false, comradeInCohesion: true, weaponBlastOrSpray: true, comradeInBlastSprayRange: false }).transfers).toBe(
            false,
        );
    });

    it.each([
        [11, true],
        [44, true],
        [99, true],
        [100, true],
        [12, false],
        [5, false],
        [0, false],
    ])('%i is doubles: %s', (roll, doubles) => {
        expect(isDoublesRoll(roll)).toBe(doubles);
    });

    const defender = (over: Partial<ComradeRecord> = {}): { uuid: string; system: object } => ({ uuid: 'Actor.pc', system: { comrade: comrade(over) } });

    it('a successful hit roll on doubles against a PC whose Comrade is in Cohesion strikes it instead', () => {
        expect(comradeHitStrike(defender(), RULES, { roll: 33, hit: true, hitsOnDefender: 2 })).toEqual({ actorUuid: 'Actor.pc', comradeName: 'Trooper Vask' });
    });

    it('not on a miss, not with every hit evaded, not out of Cohesion, not for a dead Comrade, not in a line without Comrades', () => {
        expect(comradeHitStrike(defender(), RULES, { roll: 33, hit: false, hitsOnDefender: 0 })).toBeNull();
        expect(comradeHitStrike(defender(), RULES, { roll: 33, hit: true, hitsOnDefender: 0 })).toBeNull();
        expect(comradeHitStrike(defender({ distanceM: 8 }), RULES, { roll: 33, hit: true, hitsOnDefender: 1 })).toBeNull();
        expect(comradeHitStrike(defender({ state: 'dead' }), RULES, { roll: 33, hit: true, hitsOnDefender: 1 })).toBeNull();
        expect(comradeHitStrike(defender(), null, { roll: 33, hit: true, hitsOnDefender: 1 })).toBeNull();
        expect(comradeHitStrike({ uuid: 'Actor.npc', system: {} }, RULES, { roll: 33, hit: true, hitsOnDefender: 1 })).toBeNull();
    });

    it('only one hit of a multi-hit attack strikes the Comrade; the rest hit the PC and anyone else', () => {
        const hits = [{ target: { id: 'pc' } }, { target: { id: 'other' } }, { target: { id: 'pc' } }, { target: { id: 'pc' } }];
        expect(withoutOneHitOn(hits, 'pc').map((hit) => hit.target.id)).toEqual(['pc', 'other', 'pc']);
        expect(withoutOneHitOn([{ target: { id: 'other' } }], 'pc')).toHaveLength(1);
    });
});

describe('ow-comrade — the Fear and Pinning mirror', () => {
    it.each(['fear', 'pinning'] as const)('%s: the Comrade passes or fails with its PC, whatever its Cohesion', (test) => {
        expect(comradeMirrorsFearPinning({ test, pcPassed: true, comradeImmune: false, comradeState: 'unharmed' })).toEqual({
            applies: true,
            fails: false,
            immune: false,
        });
        expect(comradeMirrorsFearPinning({ test, pcPassed: false, comradeImmune: false, comradeState: 'wounded' })).toEqual({
            applies: true,
            fails: true,
            immune: false,
        });
    });

    it('an immune Comrade does not fail with its PC', () => {
        expect(comradeMirrorsFearPinning({ test: 'fear', pcPassed: false, comradeImmune: true, comradeState: 'unharmed' })).toEqual({
            applies: true,
            fails: false,
            immune: true,
        });
    });

    it('a dead Comrade has nothing to mirror', () => {
        expect(comradeMirrorsFearPinning({ test: 'pinning', pcPassed: false, comradeImmune: false, comradeState: 'dead' }).applies).toBe(false);
    });

    it('a failed Fear test makes it flee; a failed Pinning test pins it; a recovery Order clears both', () => {
        expect(comradeMirrorWrites('fear')).toEqual({ 'system.comrade.fleeing': true });
        expect(comradeMirrorWrites('pinning')).toEqual({ 'system.comrade.pinned': true });
        expect(recoverComrade()).toEqual({ 'system.comrade.fleeing': false, 'system.comrade.pinned': false });
    });

    it('Fear ends with the combat; Pinning does not', () => {
        expect(comradeFearEndsWithCombat(comrade({ fleeing: true }))).toBe(true);
        expect(comradeFearEndsWithCombat(comrade({ pinned: true }))).toBe(false);
    });
});

describe('ow-comrade — Insanity and Corruption', () => {
    const suffer = (
        tally: ComradeRecord['mental'],
        kind: 'insanity' | 'corruption',
        amount: number,
        now: typeof ROUND | null = ROUND,
    ): ReturnType<typeof applyComradeMentalDamage> => applyComradeMentalDamage({ tally, now, kind, amount, rules: RULES });

    it('10 of either in one Round kills the Comrade', () => {
        expect(suffer(comrade().mental, 'insanity', 10).dies).toBe(true);
        expect(suffer(comrade().mental, 'corruption', 12).dies).toBe(true);
    });

    it('amounts add up within the Round, and each kind counts on its own', () => {
        const first = suffer(comrade().mental, 'insanity', 6);
        expect(first).toMatchObject({ total: 6, dies: false, tally: { combatId: 'c1', round: 2, insanity: 6, corruption: 0 } });
        expect(suffer(first.tally, 'corruption', 6)).toMatchObject({ total: 6, dies: false });
        expect(suffer(first.tally, 'insanity', 4)).toMatchObject({ total: 10, dies: true });
    });

    it('a new Round starts the count again; out of combat each amount stands alone', () => {
        const first = suffer(comrade().mental, 'insanity', 9);
        expect(suffer(first.tally, 'insanity', 9, { combatId: 'c1', round: 3 })).toMatchObject({ total: 9, dies: false });
        expect(suffer(first.tally, 'insanity', 9, null)).toMatchObject({ total: 9, dies: false });
    });

    it('negative, non-finite and fractional amounts are floored at 0 and rounded down', () => {
        expect(suffer(comrade().mental, 'insanity', -5).total).toBe(0);
        expect(suffer(comrade().mental, 'insanity', Number.NaN).total).toBe(0);
        expect(suffer(comrade().mental, 'insanity', 9.9).dies).toBe(false);
    });
});

describe('ow-comrade — readComradeRecord', () => {
    it('reads the stored Comrade, and nothing off an actor type without one', () => {
        expect(readComradeRecord({ comrade: comrade() })?.name).toBe('Trooper Vask');
        expect(readComradeRecord({})).toBeNull();
        expect(readComradeRecord({ comrade: { name: 'x', state: 'bogus' } })).toBeNull();
    });
});

describe('ow-comrade — buildComradePanel (#152)', () => {
    it('defines every value the panel renders', () => {
        const view = buildComradePanel(comrade(), false, RULES, ROUND);
        expect(Object.values(view)).not.toContain(undefined);
        expect(view).toMatchObject({
            name: 'Trooper Vask',
            stateLabelKey: 'WH40K.OW.Comrade.State.Unharmed',
            distanceM: 3,
            cohesionRangeM: 5,
            inCohesion: true,
            fleeing: false,
            pinned: false,
            canRecover: false,
            actionsLeft: 2,
            actionBudget: 2,
            canSufferMental: true,
        });
    });

    it('breaks Cohesion past 5 m or behind a barrier', () => {
        expect(buildComradePanel(comrade({ distanceM: 6 }), false, RULES, ROUND).inCohesion).toBe(false);
        expect(buildComradePanel(comrade({ hasVisualLine: false }), false, RULES, ROUND).inCohesion).toBe(false);
    });

    it('enables each state action exactly when it would change the state', () => {
        const gates = (state: ComradeRecord['state'], inCamp: boolean): object => {
            const { canWound, canHeal, canReplace } = buildComradePanel(comrade({ state }), inCamp, RULES, ROUND);
            return { canWound, canHeal, canReplace };
        };
        expect(gates('unharmed', false)).toEqual({ canWound: true, canHeal: false, canReplace: false });
        expect(gates('wounded', false)).toEqual({ canWound: true, canHeal: true, canReplace: false });
        expect(gates('dead', false)).toEqual({ canWound: false, canHeal: false, canReplace: false });
        expect(gates('dead', true)).toEqual({ canWound: false, canHeal: false, canReplace: true });
    });

    it('shows fleeing or pinned, offers the recovery Order then, and the actions left this Turn', () => {
        const view = buildComradePanel(comrade({ pinned: true, turn: { combatId: 'c1', round: 2, halvesSpent: 1 } }), false, RULES, ROUND);
        expect(view).toMatchObject({ pinned: true, canRecover: true, actionsLeft: 1 });
    });

    it('a dead Comrade has no actions, nothing to recover and no mental damage to suffer', () => {
        expect(buildComradePanel(comrade({ state: 'dead', fleeing: true }), false, RULES, ROUND)).toMatchObject({
            fleeing: false,
            canRecover: false,
            actionsLeft: 0,
            canSufferMental: false,
        });
    });

    it('shows a non-finite or negative distance as 0', () => {
        expect(buildComradePanel(comrade({ distanceM: Number.NaN }), false, RULES, ROUND).distanceM).toBe(0);
        expect(buildComradePanel(comrade({ distanceM: -2 }), false, RULES, ROUND).distanceM).toBe(0);
    });
});
