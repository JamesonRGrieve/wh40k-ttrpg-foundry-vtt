import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { materializeItemVariants } from '../utils/item-variant-utils.ts';
import { type CombatTurnStamp, counterAttackOffer, isSameTurn, type ReactionHook, type ReactionHookSource, readCombatTurnStamp } from './counter-attack.ts';

const PER_TURN: ReactionHook = { trigger: 'parrySuccess', grants: 'attack', limit: 'perTurn', attackModifier: -20 };
const UNLIMITED: ReactionHook = { ...PER_TURN, limit: 'none' };
const COUNTER_ATTACK: ReactionHookSource = { name: 'Counter Attack', hooks: [PER_TURN] };
const TURN: CombatTurnStamp = { combatId: 'c1', round: 2, turn: 3 };

describe('counterAttackOffer (#603)', () => {
    it('a successful Parry earns the talent’s attack, at its modifier', () => {
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: null, now: TURN })).toEqual({
            sourceName: 'Counter Attack',
            attackModifier: -20,
            limit: 'perTurn',
        });
    });

    it('a Dodge, a failed Parry, or no hook earns nothing', () => {
        expect(counterAttackOffer({ skill: 'dodge', success: true, sources: [COUNTER_ATTACK], lastUsed: null, now: TURN })).toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: false, sources: [COUNTER_ATTACK], lastUsed: null, now: TURN })).toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [], lastUsed: null, now: TURN })).toBeNull();
    });

    it('a per-turn hook is not offered twice in one turn, but is again on the next', () => {
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: TURN, now: TURN })).toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: TURN, now: { ...TURN, turn: 4 } })).not.toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: TURN, now: { ...TURN, round: 3 } })).not.toBeNull();
    });

    it('an unlimited hook ignores the turn stamp; out of combat nothing is spent', () => {
        expect(
            counterAttackOffer({ skill: 'parry', success: true, sources: [{ name: 'Counter Attack', hooks: [UNLIMITED] }], lastUsed: TURN, now: TURN }),
        ).not.toBeNull();
        expect(counterAttackOffer({ skill: 'parry', success: true, sources: [COUNTER_ATTACK], lastUsed: TURN, now: null })).not.toBeNull();
    });
});

describe('turn stamps', () => {
    it('compares combat, round and turn', () => {
        expect(isSameTurn(TURN, { ...TURN })).toBe(true);
        expect(isSameTurn(TURN, { ...TURN, combatId: 'c2' })).toBe(false);
        expect(isSameTurn(null, TURN)).toBe(false);
    });

    it('reads a stored stamp back, and nothing else', () => {
        expect(readCombatTurnStamp(JSON.parse(JSON.stringify(TURN)))).toEqual(TURN);
        expect(readCombatTurnStamp({ combatId: 'c1', round: '2', turn: 3 })).toBeNull();
        expect(readCombatTurnStamp(undefined)).toBeNull();
    });
});

/**
 * The compendium documents carry the hook per line (#603): every line's Counter
 * Attack is –20 after a successful Parry, and DH2 alone adds "Once per turn".
 */
describe.skipIf(!HAS_PRIVATE_CONTENT)('Counter Attack pack data', () => {
    const PACKS = resolve(__dirname, '../../packs-private');
    /** The talent's `reactionHooks` as the compendium join resolves them for `line`. */
    function hooksFor(file: string, line: 'dh1' | 'dh2' | 'rt' | 'dw' | 'bc' | 'ow'): ReactionHook[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse of a pack source document; the item-variant resolver takes its untyped system bag
        const doc = JSON.parse(readFileSync(resolve(PACKS, file), 'utf8')) as { system: Parameters<typeof materializeItemVariants>[0] };
        return materializeItemVariants(doc.system, line)['reactionHooks'] as ReactionHook[];
    }
    const SHARED = 'dark-heresy-2/dh2-core-items-talents/_source/counter-attack_DH2aTlnt00000006.json';

    it('DH2: once per turn, –20', () => {
        expect(hooksFor(SHARED, 'dh2')).toEqual([PER_TURN]);
    });

    it.each(['bc', 'ow', 'rt', 'dw'] as const)('%s: –20, no per-turn limit', (line) => {
        expect(hooksFor(SHARED, line)).toEqual([UNLIMITED]);
    });

    it('DH1: –20, no per-turn limit', () => {
        expect(hooksFor('dark-heresy-1/dh1-core-items-talents/_source/counter-attack_eemvc5UFqlY96qI8.json', 'dh1')).toEqual([UNLIMITED]);
    });
});
