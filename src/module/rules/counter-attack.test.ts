import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDeclaredPacks } from '../../../scripts/lib/pack-manifest.mjs';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { materializeItemVariants } from '../utils/item-variant-utils.ts';
import { isLineBookPack } from '../utils/line-packs.ts';
import {
    type CombatRoundStamp,
    counterAttackOffer,
    isSameRound,
    type ReactionHook,
    type ReactionHookSource,
    readCombatRoundStamp,
    spentCounterAttack,
} from './counter-attack.ts';

const PER_ROUND: ReactionHook = { trigger: 'parrySuccess', grants: 'attack', limit: 'perRound', attackModifier: -20 };
const UNLIMITED: ReactionHook = { ...PER_ROUND, limit: 'none' };
const COUNTER_ATTACK: ReactionHookSource = { name: 'Counter Attack', hooks: [PER_ROUND] };
const ROUND: CombatRoundStamp = { combatId: 'c1', round: 2 };

describe('counterAttackOffer (#603)', () => {
    it('a successful Parry earns the talent’s attack, at its modifier', () => {
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: null, now: ROUND })).toEqual({
            sourceName: 'Counter Attack',
            attackModifier: -20,
            limit: 'perRound',
        });
    });

    it('a Dodge, a failed Parry, or no hook earns nothing', () => {
        expect(counterAttackOffer({ skill: 'dodge', success: true, sources: [COUNTER_ATTACK], lastUsed: null, now: ROUND })).toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: false, sources: [COUNTER_ATTACK], lastUsed: null, now: ROUND })).toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [], lastUsed: null, now: ROUND })).toBeNull();
    });

    it('DH2 "once per turn" is once per ROUND: a second Parry in the same round (Step Aside) earns none', () => {
        // The stamp carries no combatant turn: another combatant's turn in the same
        // round is still the same round.
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: { ...ROUND } })).toBeNull();
    });

    it('a successful Parry in the next round earns it again', () => {
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: { ...ROUND, round: 3 } })).not.toBeNull();
        expect(
            counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: { combatId: 'c2', round: 2 } }),
        ).not.toBeNull();
    });

    it('an unlimited hook ignores the round stamp; out of combat nothing is spent', () => {
        expect(
            counterAttackOffer({ skill: 'parry', success: true, sources: [{ name: 'Counter Attack', hooks: [UNLIMITED] }], lastUsed: ROUND, now: ROUND }),
        ).not.toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: null })).not.toBeNull();
    });
});

describe('spentCounterAttack (#603)', () => {
    it('names the hook a successful Parry would have earned, already used this round', () => {
        expect(spentCounterAttack({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: { ...ROUND } })).toBe('Counter Attack');
    });

    it('is null when the Parry earns the attack', () => {
        expect(spentCounterAttack({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: null, now: ROUND })).toBeNull();
        expect(spentCounterAttack({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: { ...ROUND, round: 3 } })).toBeNull();
        // An unlimited hook is offered even after a stamp in the same round.
        expect(
            spentCounterAttack({ skill: 'parry', success: true, sources: [{ name: 'Counter Attack', hooks: [UNLIMITED] }], lastUsed: ROUND, now: ROUND }),
        ).toBeNull();
    });

    it('is null when the Parry would earn nothing anyway', () => {
        expect(spentCounterAttack({ skill: 'dodge', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: ROUND })).toBeNull();
        expect(spentCounterAttack({ skill: 'parry', success: false, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: ROUND })).toBeNull();
        expect(spentCounterAttack({ skill: 'parry', success: true, sources: [], lastUsed: ROUND, now: ROUND })).toBeNull();
        expect(spentCounterAttack({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: ROUND, now: null })).toBeNull();
    });
});

describe('round stamps', () => {
    it('compares combat and round', () => {
        expect(isSameRound(ROUND, { ...ROUND })).toBe(true);
        expect(isSameRound(ROUND, { ...ROUND, round: 3 })).toBe(false);
        expect(isSameRound(ROUND, { ...ROUND, combatId: 'c2' })).toBe(false);
        expect(isSameRound(null, ROUND)).toBe(false);
    });

    it('reads a stored stamp back, and nothing else', () => {
        expect(readCombatRoundStamp(JSON.parse(JSON.stringify(ROUND)))).toEqual(ROUND);
        expect(readCombatRoundStamp({ combatId: 'c1', round: '2' })).toBeNull();
        expect(readCombatRoundStamp(undefined)).toBeNull();
    });
});

/**
 * The compendium documents carry the hook per line (#603): every line's Counter
 * Attack is –20 after a successful Parry; DH2 alone limits it (once per round), the
 * other five cores print no limit beyond the Reaction.
 */
describe.skipIf(!HAS_PRIVATE_CONTENT)('Counter Attack pack data', () => {
    const REPO_ROOT = resolve(__dirname, '../../..');
    /** The path of `file` in whichever of `packLine`'s book talents packs holds it, by manifest flags. */
    function talentSource(packLine: string, file: string): string {
        for (const pack of readDeclaredPacks(REPO_ROOT).packs) {
            if (!isLineBookPack(pack, packLine, 'talents')) continue;
            const path = resolve(REPO_ROOT, 'src/packs-private', pack.path.replace(/^packs\//, ''), '_source', file);
            if (existsSync(path)) return path;
        }
        throw new Error(`no ${packLine} talents pack holds ${file}`);
    }
    /** The talent's `reactionHooks` as the compendium join resolves them for `line`. */
    function hooksFor(packLine: string, file: string, line: 'dh1' | 'dh2' | 'rt' | 'dw' | 'bc' | 'ow'): ReactionHook[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse of a pack source document; the item-variant resolver takes its untyped system bag
        const doc = JSON.parse(readFileSync(talentSource(packLine, file), 'utf8')) as { system: Parameters<typeof materializeItemVariants>[0] };
        return materializeItemVariants(doc.system, line)['reactionHooks'] as ReactionHook[];
    }
    const SHARED = 'counter-attack_DH2aTlnt00000006.json';

    it('DH2: once per round, –20', () => {
        expect(hooksFor('dh2', SHARED, 'dh2')).toEqual([PER_ROUND]);
    });

    it.each(['bc', 'ow', 'rt', 'dw'] as const)('%s: –20, no limit of its own', (line) => {
        expect(hooksFor('dh2', SHARED, line)).toEqual([UNLIMITED]);
    });

    it('DH1: –20, no limit of its own', () => {
        expect(hooksFor('dh1', 'counter-attack_eemvc5UFqlY96qI8.json', 'dh1')).toEqual([UNLIMITED]);
    });
});
