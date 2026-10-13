import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import type { GameSystemId } from '../config/game-systems/types.ts';
import {
    type EvasionAttack,
    type EvasionRules,
    evasionBlockReason,
    evasionNegation,
    hitsOnTarget,
    isMultiHitAttack,
    parryBlockReason,
    withoutNegatedHits,
} from './evasion.ts';

/** A line's printed evasion rule, read from its game-system config. */
function rulesOf(line: GameSystemId): EvasionRules | null {
    return SystemConfigRegistry.get(line).evasionRules;
}

function attack(overrides: Partial<EvasionAttack> = {}): EvasionAttack {
    return { action: 'Standard Attack', hitsLanded: 1, storm: false, twinLinked: false, ...overrides };
}

describe('evasionNegation — a single hit (#414)', () => {
    it('a success negates the hit, whatever the degrees', () => {
        const result = evasionNegation({ success: true, dos: 4, degreesMethod: 'gen2', attack: attack(), rules: rulesOf('dh2') });
        expect(result).toEqual({ negated: 1, remaining: 0, multiHit: false, parts: [{ key: 'hit', value: 1 }] });
    });

    it('a failure negates nothing', () => {
        expect(
            evasionNegation({
                success: false,
                dos: 0,
                degreesMethod: 'gen2',
                attack: attack({ hitsLanded: 3, action: 'Full Auto Burst' }),
                rules: rulesOf('dh2'),
            }),
        ).toEqual({
            negated: 0,
            remaining: 3,
            multiHit: false,
            parts: [],
        });
    });
});

describe('evasionNegation — multi-hit attacks per line (#414)', () => {
    // DH2 counts the bare success as a degree (Gen 2): 2 DoS → the hit + 2 more.
    it('DH2: a burst loses the hit plus one per degree of success', () => {
        const result = evasionNegation({
            success: true,
            dos: 2,
            degreesMethod: 'gen2',
            attack: attack({ action: 'Full Auto Burst', hitsLanded: 5 }),
            rules: rulesOf('dh2'),
        });
        expect(result.negated).toBe(3);
        expect(result.remaining).toBe(2);
        expect(result.parts).toEqual([
            { key: 'hit', value: 1 },
            { key: 'degrees', value: 2 },
        ]);
    });

    // Gen 1 lines count only full tens of margin: pipeline dos 3 is 2 printed degrees.
    it.each(['rt', 'dw', 'dh1', 'bc', 'ow'] as const)('%s: a burst loses the hit plus one per printed (Gen 1) degree', (line) => {
        const result = evasionNegation({
            success: true,
            dos: 3,
            degreesMethod: 'gen1',
            attack: attack({ action: 'Semi-Auto Burst', hitsLanded: 6 }),
            rules: rulesOf(line),
        });
        expect(result.negated).toBe(3);
    });

    it('caps the negation at the hits that landed', () => {
        const result = evasionNegation({
            success: true,
            dos: 5,
            degreesMethod: 'gen2',
            attack: attack({ action: 'Full Auto Burst', hitsLanded: 2 }),
            rules: rulesOf('dh2'),
        });
        expect(result.negated).toBe(2);
        expect(result.remaining).toBe(0);
        expect(result.parts.reduce((sum, part) => sum + part.value, 0)).toBe(2);
        expect(result.parts.at(-1)).toEqual({ key: 'cap', value: -4 });
    });

    it('Swift / Lightning Attacks count in DH2, BC and OW, but not in DH1, RT or DW', () => {
        const swift = attack({ action: 'Swift Attack', hitsLanded: 3 });
        for (const line of ['dh2', 'bc', 'ow'] as const) expect(isMultiHitAttack(swift, rulesOf(line))).toBe(true);
        for (const line of ['dh1', 'rt', 'dw'] as const) expect(isMultiHitAttack(swift, rulesOf(line))).toBe(false);
    });

    it('Twin-Linked counts in DH2 and OW only', () => {
        const twin = attack({ hitsLanded: 2, twinLinked: true });
        expect(isMultiHitAttack(twin, rulesOf('ow'))).toBe(true);
        expect(isMultiHitAttack(twin, rulesOf('dh2'))).toBe(true);
        expect(isMultiHitAttack(twin, rulesOf('bc'))).toBe(false);
    });

    it('DH2 counts any other attack that inflicts several hits', () => {
        expect(isMultiHitAttack(attack({ action: 'All Out Attack', hitsLanded: 2 }), rulesOf('dh2'))).toBe(true);
        expect(isMultiHitAttack(attack({ action: 'All Out Attack', hitsLanded: 2 }), rulesOf('ow'))).toBe(false);
    });

    it('Storm: two hits a degree in DH2 and OW', () => {
        const storm = attack({ action: 'Full Auto Burst', hitsLanded: 8, storm: true });
        expect(evasionNegation({ success: true, dos: 2, degreesMethod: 'gen2', attack: storm, rules: rulesOf('dh2') }).negated).toBe(4);
        // A bare Gen 1 success still negates the hit — two Storm shots.
        expect(evasionNegation({ success: true, dos: 1, degreesMethod: 'gen1', attack: storm, rules: rulesOf('ow') }).negated).toBe(2);
        // BC prints no Storm evasion rule: the ordinary progression.
        expect(evasionNegation({ success: true, dos: 3, degreesMethod: 'gen1', attack: storm, rules: rulesOf('bc') }).negated).toBe(3);
    });

    it('a line with no modelled multi-hit rule negates just the hit', () => {
        expect(
            evasionNegation({
                success: true,
                dos: 4,
                degreesMethod: 'gen2',
                attack: attack({ action: 'Full Auto Burst', hitsLanded: 5 }),
                rules: rulesOf('im'),
            }).negated,
        ).toBe(1);
    });
});

describe('evasionBlockReason', () => {
    it('a grapple participant cannot react — controller or controlled', () => {
        expect(evasionBlockReason({ reactionRemaining: 1, actionLimit: 'none', inGrapple: true })).toBe('WH40K.Evasion.Blocked.Grappled');
        expect(evasionBlockReason({ reactionRemaining: null, actionLimit: 'grappleOnly', inGrapple: false })).toBe('WH40K.Evasion.Blocked.Grappled');
    });

    it('a spent Reaction, or a condition that removes it, closes the window', () => {
        expect(evasionBlockReason({ reactionRemaining: 0, actionLimit: 'none', inGrapple: false })).toBe('WH40K.Combat.ReactionUsed');
        expect(evasionBlockReason({ reactionRemaining: 0, actionLimit: 'noActions', inGrapple: false })).toBe('WH40K.Combat.ReactionBlockedByCondition');
    });

    it('out of combat, or with a Reaction left, the window is open', () => {
        expect(evasionBlockReason({ reactionRemaining: null, actionLimit: 'none', inGrapple: false })).toBeNull();
        expect(evasionBlockReason({ reactionRemaining: 1, actionLimit: 'halfActionOnly', inGrapple: false })).toBeNull();
    });
});

describe('parryBlockReason', () => {
    const open = { isMeleeAttack: true, attackerPreventsParry: false, defenderWeaponsCanParry: [true] };

    it('Parry answers melee only', () => {
        expect(parryBlockReason({ ...open, isMeleeAttack: false })).toBe('WH40K.Evasion.Blocked.ParryRanged');
    });

    it('a Flexible attacking weapon cannot be Parried', () => {
        expect(parryBlockReason({ ...open, attackerPreventsParry: true })).toBe('WH40K.Evasion.Blocked.Flexible');
    });

    it('a defender holding only Unwieldy weapons cannot Parry; bare hands can', () => {
        expect(parryBlockReason({ ...open, defenderWeaponsCanParry: [false] })).toBe('WH40K.Evasion.Blocked.Unwieldy');
        expect(parryBlockReason({ ...open, defenderWeaponsCanParry: [false, true] })).toBeNull();
        expect(parryBlockReason({ ...open, defenderWeaponsCanParry: [] })).toBeNull();
    });
});

describe('withoutNegatedHits', () => {
    const target = { id: 'target' };
    const other = { id: 'other' };
    const allocation = [
        { target, hitIndexForTarget: 0 },
        { target: other, hitIndexForTarget: 0 },
        { target, hitIndexForTarget: 1 },
        { target, hitIndexForTarget: 2 },
    ];

    it('drops the evader’s last hits and leaves hits on other targets alone', () => {
        expect(withoutNegatedHits(allocation, 'target', 2)).toEqual([
            { target, hitIndexForTarget: 0 },
            { target: other, hitIndexForTarget: 0 },
        ]);
    });

    it('drops every hit of a fully evaded attack and nothing when none was negated', () => {
        expect(withoutNegatedHits(allocation, 'target', 9)).toEqual([{ target: other, hitIndexForTarget: 0 }]);
        expect(withoutNegatedHits(allocation, 'target', 0)).toEqual(allocation);
    });

    it('counts the hits that landed on the evader', () => {
        expect(hitsOnTarget(allocation, 'target')).toBe(3);
    });
});
